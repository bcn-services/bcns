/**
 * calendar.ts — the shared Google calendar, read-only, for Today. A service account (JWT, RS256, node:crypto)
 * lists the next 7 days of GOOGLE_CALENDAR_ID; each person sees only events they are invited to.
 * Nothing here throws: unset env -> "unconfigured", fetch trouble -> "error". Zero dependencies.
 */
import { createSign } from "node:crypto";

export interface CalEvent {
  id: string;
  title: string;
  /** ISO instant, or YYYY-MM-DD for an all-day event. */
  start: string;
  allDay: boolean;
  /** Only ever an https://meet.google.com/ link; anything else in the calendar data is dropped. */
  meet: string | null;
}
export type CalResult =
  | { state: "ok"; events: CalEvent[] }
  | { state: "unconfigured" | "error"; events: [] };

interface GEvent {
  id?: string;
  status?: string;
  summary?: string;
  hangoutLink?: string;
  start?: { dateTime?: string; date?: string };
  attendees?: { email?: string; responseStatus?: string }[];
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const TTL_MS = 60_000;
const b64 = (v: string | Buffer) => Buffer.from(v).toString("base64url");

// ponytail: one shared cache entry (a single calendar, 60 s) — key by calendar id if HQ ever reads more than one.
let cache: { at: number; list: GEvent[] | "error" } | null = null;
export function resetCalendarCache() {
  cache = null;
}

/** Signed service-account assertion for the token exchange. The key arrives from env with literal "\n". */
export function signAssertion(email: string, privateKey: string, nowS: number): string {
  const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64(
    JSON.stringify({ iss: email, scope: SCOPE, aud: TOKEN_URL, iat: nowS, exp: nowS + 3600 })
  );
  const sig = createSign("RSA-SHA256").update(`${head}.${claim}`).sign(privateKey.replace(/\\n/g, "\n"));
  return `${head}.${claim}.${b64(sig)}`;
}

async function fetchList(f: typeof fetch, now: Date, email: string, key: string, calId: string) {
  const tok = await f(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signAssertion(email, key, Math.floor(now.getTime() / 1000)),
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!tok.ok) throw new Error(`token ${tok.status}`);
  const { access_token } = (await tok.json()) as { access_token?: string };
  if (!access_token) throw new Error("no access_token");
  const q = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });
  const r = await f(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${q}`,
    { headers: { authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(5000) }
  );
  if (!r.ok) throw new Error(`events ${r.status}`);
  return ((await r.json()) as { items?: GEvent[] }).items ?? [];
}

/** The next 7 days of events that invite `email`. Cached 60 s (errors too, so a broken Google is not hammered). */
export async function loadCalendar(
  email: string,
  opts: { fetch?: typeof fetch; now?: Date } = {}
): Promise<CalResult> {
  const sa = process.env.GOOGLE_SA_EMAIL;
  const key = process.env.GOOGLE_SA_PRIVATE_KEY;
  const calId = process.env.GOOGLE_CALENDAR_ID;
  if (!sa || !key || !calId) return { state: "unconfigured", events: [] };
  const now = opts.now ?? new Date();
  if (!cache || now.getTime() - cache.at >= TTL_MS || now.getTime() < cache.at) {
    try {
      cache = { at: now.getTime(), list: await fetchList(opts.fetch ?? fetch, now, sa, key, calId) };
    } catch {
      cache = { at: now.getTime(), list: "error" };
    }
  }
  if (cache.list === "error") return { state: "error", events: [] };
  const me = email.trim().toLowerCase();
  const events: CalEvent[] = [];
  for (const e of cache.list) {
    const a = e.attendees?.find((x) => x.email?.toLowerCase() === me);
    const start = e.start?.dateTime ?? e.start?.date;
    if (!a || a.responseStatus === "declined" || e.status === "cancelled" || !start) continue;
    events.push({
      id: e.id ?? start,
      title: e.summary?.trim() || "(no title)",
      start,
      allDay: !e.start?.dateTime,
      meet: e.hangoutLink?.startsWith("https://meet.google.com/") ? e.hangoutLink : null,
    });
  }
  return { state: "ok", events };
}
