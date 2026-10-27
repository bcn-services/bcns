/**
 * ics.ts — the consult as a calendar entry: a Google Calendar "add event" URL and an .ics body.
 * No next/* imports. `icsResponse` takes the Supabase client so the route stays a two-liner and tests need no Next.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "./leads";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const end = (start: Date, minutes: number) => new Date(start.getTime() + minutes * 60_000);

export function googleCalendarUrl(e: { title: string; start: Date; minutes?: number; details?: string }): string {
  const dates = `${stamp(e.start)}/${stamp(end(e.start, e.minutes ?? 30))}`;
  return (
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    `&text=${encodeURIComponent(e.title)}&dates=${dates}` +
    (e.details ? `&details=${encodeURIComponent(e.details)}` : "")
  );
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// RFC 5545 line folding at 75 characters (ASCII-safe; names with multibyte chars may fold a few bytes long).
const fold = (l: string) => (l.match(/.{1,74}/g) ?? [""]).join("\r\n ");

export function icsBody(e: {
  uid: string;
  title: string;
  start: Date;
  minutes?: number;
  description?: string;
  now?: Date;
}): string {
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//bcns//HQ//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp(e.now ?? new Date())}`,
      `DTSTART:${stamp(e.start)}`,
      `DTEND:${stamp(end(e.start, e.minutes ?? 30))}`,
      `SUMMARY:${esc(e.title)}`,
      ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .map(fold)
      .join("\r\n") + "\r\n"
  );
}

export const consultTitle = (name: string) => `Consult: ${name}`;

/** GET /api/ics/[id]: the .ics for a lead with consult_at (session + RLS gate the read). */
export async function icsResponse(sb: SupabaseClient, id: string): Promise<Response> {
  if (!isUuid(id)) return new Response("not found", { status: 404 });
  const { data } = await sb.from("businesses").select("id, name, consult_at").eq("id", id).maybeSingle();
  const b = data as { id: string; name: string; consult_at: string | null } | null;
  if (!b?.consult_at) return new Response("not found", { status: 404 });
  const body = icsBody({
    uid: `consult-${b.id}@hq.bcn-services.com`,
    title: consultTitle(b.name),
    start: new Date(b.consult_at),
    description: "bcns consult",
  });
  const file = b.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "consult";
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="consult-${file}.ics"`,
      "cache-control": "no-store",
    },
  });
}
