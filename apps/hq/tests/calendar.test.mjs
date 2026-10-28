// loadCalendar: env gate, JWT shape, attendee filter, 60 s memo, degrade-never-throw. The RSA key is made in-test.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { loadCalendar, resetCalendarCache } from "../lib/calendar.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" });
const NOW = new Date("2026-10-27T15:00:00Z");

const ev = (id, who, extra = {}) => ({
  id,
  summary: id,
  start: { dateTime: "2026-10-28T14:00:00Z" },
  attendees: who.map((email) => ({ email })),
  ...extra,
});
const ITEMS = [
  ev("mine", ["Nate@bcn-services.com", "b@bcn-services.com"], { hangoutLink: "https://meet.google.com/abc-defg-hij" }),
  ev("theirs", ["b@bcn-services.com"]),
  ev("evil", ["nate@bcn-services.com"], { hangoutLink: "https://evil.example/meet" }),
  ev("cancelled", ["nate@bcn-services.com"], { status: "cancelled" }),
  { id: "declined", start: { date: "2026-10-29" }, attendees: [{ email: "nate@bcn-services.com", responseStatus: "declined" }] },
  { id: "allday", summary: "Holiday", start: { date: "2026-10-30" }, attendees: [{ email: "nate@bcn-services.com" }] },
];

function stub({ tokenOk = true, eventsOk = true } = {}) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith("https://oauth2.googleapis.com/token"))
      return tokenOk ? Response.json({ access_token: "tok" }) : new Response("no", { status: 401 });
    return eventsOk ? Response.json({ items: ITEMS }) : new Response("no", { status: 500 });
  };
  return { f, calls };
}

const ENV = ["GOOGLE_SA_EMAIL", "GOOGLE_SA_PRIVATE_KEY", "GOOGLE_CALENDAR_ID"];
function setEnv() {
  process.env.GOOGLE_SA_EMAIL = "sa@proj.iam.gserviceaccount.com";
  process.env.GOOGLE_SA_PRIVATE_KEY = pem.replace(/\n/g, "\\n"); // env files carry literal \n
  process.env.GOOGLE_CALENDAR_ID = "team@group.calendar.google.com";
}
beforeEach(() => {
  resetCalendarCache();
  for (const k of ENV) delete process.env[k];
});

test("any of the three env vars unset -> unconfigured, no fetch", async () => {
  for (const drop of ENV) {
    setEnv();
    delete process.env[drop];
    const { f, calls } = stub();
    assert.deepEqual(await loadCalendar("nate@bcn-services.com", { fetch: f, now: NOW }), { state: "unconfigured", events: [] });
    assert.equal(calls.length, 0);
  }
});

test("lists only events that invite me, drops declined/cancelled/untrusted links", async () => {
  setEnv();
  const { f, calls } = stub();
  const r = await loadCalendar("NATE@bcn-services.com", { fetch: f, now: NOW });
  assert.equal(r.state, "ok");
  assert.deepEqual(r.events.map((e) => e.id), ["mine", "evil", "allday"]);
  assert.equal(r.events[0].meet, "https://meet.google.com/abc-defg-hij");
  assert.equal(r.events[1].meet, null);
  assert.equal(r.events[2].allDay, true);
  const url = new URL(calls[1].url);
  assert.equal(url.pathname, "/calendar/v3/calendars/team%40group.calendar.google.com/events");
  assert.equal(url.searchParams.get("timeMin"), NOW.toISOString());
  assert.equal(url.searchParams.get("timeMax"), "2026-11-03T15:00:00.000Z");
  assert.equal(calls[1].init.headers.authorization, "Bearer tok");
});

test("token request carries a valid RS256 service-account assertion", async () => {
  setEnv();
  const { f, calls } = stub();
  await loadCalendar("nate@bcn-services.com", { fetch: f, now: NOW });
  const body = calls[0].init.body;
  assert.equal(body.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
  const [h, c, s] = body.get("assertion").split(".");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url")), { alg: "RS256", typ: "JWT" });
  const claim = JSON.parse(Buffer.from(c, "base64url"));
  assert.equal(claim.iss, "sa@proj.iam.gserviceaccount.com");
  assert.equal(claim.scope, "https://www.googleapis.com/auth/calendar.readonly");
  assert.equal(claim.aud, "https://oauth2.googleapis.com/token");
  assert.equal(claim.iat, Math.floor(NOW.getTime() / 1000));
  assert.equal(claim.exp - claim.iat, 3600);
  assert.ok(createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(s, "base64url")));
});

test("memoized 60 s: a second call reuses the list, a call 61 s later refetches", async () => {
  setEnv();
  const { f, calls } = stub();
  await loadCalendar("nate@bcn-services.com", { fetch: f, now: NOW });
  await loadCalendar("b@bcn-services.com", { fetch: f, now: new Date(NOW.getTime() + 59_000) });
  assert.equal(calls.length, 2); // token + events once
  await loadCalendar("nate@bcn-services.com", { fetch: f, now: new Date(NOW.getTime() + 61_000) });
  assert.equal(calls.length, 4);
});

test("token failure, events failure, and a throwing fetch all degrade to error (and the error is cached)", async () => {
  setEnv();
  for (const s of [stub({ tokenOk: false }), stub({ eventsOk: false })]) {
    resetCalendarCache();
    assert.deepEqual(await loadCalendar("nate@bcn-services.com", { fetch: s.f, now: NOW }), { state: "error", events: [] });
  }
  resetCalendarCache();
  const boom = async () => {
    throw new Error("network");
  };
  assert.equal((await loadCalendar("nate@bcn-services.com", { fetch: boom, now: NOW })).state, "error");
  const { f, calls } = stub();
  assert.equal((await loadCalendar("nate@bcn-services.com", { fetch: f, now: NOW })).state, "error");
  assert.equal(calls.length, 0);
});

test("a garbage private key degrades to error instead of throwing", async () => {
  setEnv();
  process.env.GOOGLE_SA_PRIVATE_KEY = "not a key";
  const { f } = stub();
  assert.equal((await loadCalendar("nate@bcn-services.com", { fetch: f, now: NOW })).state, "error");
});

test("calTime: ET clock without am/pm, weekday prefix off today, all-day wording", async () => {
  const { calTime } = await import("../lib/calendar.ts");
  const now = new Date("2026-10-27T15:00:00Z"); // Tue Oct 27, 11:00 ET
  assert.equal(calTime({ start: "2026-10-27T19:00:00Z", allDay: false }, now), "3:00");
  assert.equal(calTime({ start: "2026-10-28T18:30:00Z", allDay: false }, now), "Wed 2:30");
  assert.equal(calTime({ start: "2026-10-27", allDay: true }, now), "all day");
  assert.equal(calTime({ start: "2026-10-30", allDay: true }, now), "Fri all day");
  // 02:00 UTC on the 28th is still the 27th in New York
  assert.equal(calTime({ start: "2026-10-28T02:00:00Z", allDay: false }, now), "10:00");
});
