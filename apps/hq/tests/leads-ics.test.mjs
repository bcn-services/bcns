/** leads-ics.test.mjs — Google Calendar URL, .ics body, and the .ics route handler (icsResponse) with a fake client. */

import { test } from "node:test";
import assert from "node:assert/strict";

const { googleCalendarUrl, icsBody, icsResponse } = await import("../lib/ics.ts");

const ID = "11111111-1111-4111-8111-111111111111";
const start = new Date("2026-10-28T14:00:00Z");

test("googleCalendarUrl: template action, title, UTC start/end (30 min)", () => {
  const u = googleCalendarUrl({ title: "Consult: Harbor Light & Co", start });
  assert.ok(u.startsWith("https://calendar.google.com/calendar/render?action=TEMPLATE&"));
  assert.ok(u.includes("text=Consult%3A%20Harbor%20Light%20%26%20Co"));
  assert.ok(u.includes("dates=20261028T140000Z/20261028T143000Z"));
  assert.ok(googleCalendarUrl({ title: "x", start, minutes: 60 }).includes("/20261028T150000Z"));
});

test("icsBody: CRLF VEVENT with UTC times, escaped text, folded long lines", () => {
  const b = icsBody({ uid: "consult-1@hq", title: "Consult: A, B; C", start, now: new Date("2026-10-27T09:00:00Z"), description: "x".repeat(200) });
  assert.ok(b.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(b.endsWith("END:VEVENT\r\nEND:VCALENDAR\r\n"));
  for (const l of ["UID:consult-1@hq", "DTSTAMP:20261027T090000Z", "DTSTART:20261028T140000Z", "DTEND:20261028T143000Z", "SUMMARY:Consult: A\\, B\\; C"])
    assert.ok(b.split("\r\n").includes(l), l);
  for (const line of b.split("\r\n")) assert.ok(line.length <= 75, `line too long: ${line.length}`);
  assert.ok(!b.replace(/\r\n/g, "").includes("\n"));
});

function fakeSb(row) {
  return { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) };
}

test("icsResponse: streams the .ics for a lead with consult_at", async () => {
  const res = await icsResponse(fakeSb({ id: ID, name: "hq3 Harbor Light", consult_at: "2026-10-28T14:00:00Z" }), ID);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/calendar/);
  assert.match(res.headers.get("content-disposition"), /^attachment; filename="consult-hq3-Harbor-Light\.ics"$/);
  const body = await res.text();
  assert.ok(body.includes("DTSTART:20261028T140000Z"));
  assert.ok(body.includes("SUMMARY:Consult: hq3 Harbor Light"));
});

test("icsResponse: 404 without consult_at, without the lead, or with a malformed id", async () => {
  assert.equal((await icsResponse(fakeSb({ id: ID, name: "x", consult_at: null }), ID)).status, 404);
  assert.equal((await icsResponse(fakeSb(null), ID)).status, 404);
  assert.equal((await icsResponse(fakeSb({ id: ID, name: "x", consult_at: "2026-10-28T14:00:00Z" }), "../etc")).status, 404);
});
