// Weekday nudge: one email, "N calls waiting, M new today", plus a link to Today.
// Replaces the old daily digest. Counts only: no names, phones or emails go in the
// body or the event. Resend over plain fetch, same shape as apps/connect/lib/request-connection.ts.

export const TODAY_URL = "https://hq.bcn-services.com/";
export const FROM = "bcns HQ <bot@bcn-services.com>";
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function message({ waiting, fresh }) {
  const subject = `${waiting} ${waiting === 1 ? "call" : "calls"} waiting, ${fresh} new today`;
  return { subject, text: `${subject}\n\n${TODAY_URL}\n` };
}

export function nudgeDeps(env) {
  const dryRun = env.NUDGE_DRY_RUN === "1";
  for (const k of ["RESEND_API_KEY", "NUDGE_TO"])
    if (!env[k] && !dryRun) throw new Error(`${k} is not set`);
  return { apiKey: env.RESEND_API_KEY, to: env.NUDGE_TO, dryRun };
}

export async function run({ sql, db, apiKey, to, dryRun = false, fetch: fetchImpl = fetch }) {
  // Same UTC day boundary as db.promotedToday. A second start the same day is a no-op.
  const sent = await sql`
    select 1 from events
    where job = 'nudge' and kind = 'sent'
      and created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
    limit 1
  `;
  if (sent.length) return { sent: false, reason: "already sent" };

  // ponytail: assigned_to is hard-coded to the one caller; make it a dep when a second person gets a nudge.
  const [{ count: waiting }] = await sql`
    select count(*)::int as count from businesses
    where stage = 'call_due' and suppressed_at is null and assigned_to = 'brandon'
  `;
  if (waiting === 0) return { sent: false, waiting: 0 };

  const [{ count: fresh }] = await db.promotedToday(sql);
  const { subject, text } = message({ waiting, fresh });
  if (dryRun) {
    console.log(`${subject}\n${text}`);
    return { sent: false, dryRun: true, waiting, fresh };
  }

  let res;
  try {
    res = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new Error(`Resend request failed: ${err?.name ?? "error"}`);
  }
  if (!(res.status >= 200 && res.status < 300))
    throw new Error(`Resend returned HTTP ${res.status}`);

  await db.logEvent(sql, "nudge", "sent", { waiting, fresh });
  return { sent: true, waiting, fresh };
}
