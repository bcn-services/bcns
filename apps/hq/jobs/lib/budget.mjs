// Month-to-date Places spend, counted from our own `events` table: source
// writes one `places_call` row per search request BEFORE the request goes out
// (jobs/source.mjs), so a crash mid-call still counts. HQ has one job runner,
// so a local tally is the whole truth (the old Cloud Monitoring read is gone).
//
// Fails closed. A count that cannot be established throws, because a
// readBudget that guesses a number is a bill. The month resets by itself: the
// window is the current UTC calendar month.

export const DEFAULT_CAP = 950;

export function createReadBudget({ sql, cap = DEFAULT_CAP, now = () => new Date() } = {}) {
  if (!sql) throw new Error("createReadBudget needs a sql client");

  return async function readBudget() {
    const end = now();
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    const rows = await sql`
      select count(*)::int as used from events
      where kind = 'places_call' and created_at >= ${start}
    `;
    const used = Number(rows?.[0]?.used);
    if (!Number.isFinite(used) || used < 0) throw new Error("malformed usage count");
    return {
      remaining: Math.max(0, cap - used),
      month: start.toISOString().slice(0, 7),
      used,
      cap,
    };
  };
}
