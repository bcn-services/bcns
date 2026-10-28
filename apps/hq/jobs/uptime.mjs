// Uptime: every 5 minutes (infra/hq-uptime.timer) GET /api/health on each app and write one
// uptime_checks row per target. The Clients page derives a client's "app up" from the newest row
// (lib/clients/health.ts). Rows older than 7 days are deleted at the end of every run.
//
// A target that times out, refuses or answers non-2xx is a result (ok=false), never a thrown job
// error: a dead app is the thing being measured. Only a database failure fails the run.
// The SQL lives here, not in lib/db.mjs, so this job touches no shared file.

export const TARGETS = ["sb", "connect", "mcp", "hq", "ta"];
export const KEEP_DAYS = 7;
export const TIMEOUT_MS = 10_000;

export const urlFor = (slug) => `https://${slug}.bcn-services.com/api/health`;

// One GET. redirect:"manual" so a 3xx (a login bounce) counts as not-ok instead of a followed 200.
export async function check(
  slug,
  { fetchImpl = fetch, timeoutMs = TIMEOUT_MS, now = Date.now } = {}
) {
  const t0 = now();
  try {
    const res = await fetchImpl(urlFor(slug), {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "bcns-hq-uptime" },
    });
    return {
      target: slug,
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      latency_ms: now() - t0,
    };
  } catch {
    return { target: slug, ok: false, status: null, latency_ms: now() - t0 };
  }
}

export async function run({
  sql,
  fetch: fetchImpl = fetch,
  targets = TARGETS,
  timeoutMs = TIMEOUT_MS,
} = {}) {
  const results = await Promise.all(targets.map((t) => check(t, { fetchImpl, timeoutMs })));
  for (const r of results) {
    await sql`
      insert into uptime_checks (target, ok, status, latency_ms)
      values (${r.target}, ${r.ok}, ${r.status}, ${r.latency_ms})
    `;
  }
  const pruned = await sql`
    delete from uptime_checks where checked_at < now() - make_interval(days => ${KEEP_DAYS})
  `;
  return {
    checked: results.length,
    down: results.filter((r) => !r.ok).map((r) => r.target),
    pruned: pruned?.count ?? 0,
  };
}
