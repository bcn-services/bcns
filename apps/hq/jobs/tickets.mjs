// Tickets: every 15 minutes (infra/hq-tickets.timer) pull support tickets from the platform DB
// (Connect) and the TA DB, keep one HQ task per ticket (alert_key 'ticket:<src>:<id>'), close the task
// when the ticket closed at the source, and push tasks.resolution + a closed status back for done,
// unsynced tasks. HQ never emails: the source apps own the customer-facing side.
//
// A source is {name, pull() -> rows, resolve(id, text), close()}; rows are {id, slug, subject, body,
// severity, status, created_at, updated_at}, status open|answered|closed. Tests pass fakes.
// One source failing never stops the other; the job throws after both ran so the run is logged
// ok:false and the ops:job:tickets alert fires.

export const SUBJECT_MAX = 80;
export const BODY_MAX = 4000;

// Copy of verifyFullUrl in lib/ops.ts (jobs are plain ESM and cannot import TS): the URL's own
// sslmode is replaced, never trusted.
export function verifyFullUrl(url) {
  const q = url.indexOf("?", url.lastIndexOf("@") + 1);
  const base = q < 0 ? url : url.slice(0, q);
  const rest = q < 0 ? [] : url.slice(q + 1).split("&");
  const kept = rest.filter((kv) => kv && !/^sslmode=/i.test(kv));
  return `${base}?${[...kept, "sslmode=verify-full"].join("&")}`;
}

const SOURCES = [
  {
    name: "platform",
    env: "PLATFORM_TICKETS_URL",
    pull: "select * from ops.hq_tickets_pull()",
    resolve: "select ops.hq_ticket_resolve($1::uuid, $2)",
  },
  {
    name: "ta",
    env: "TA_TICKETS_URL",
    pull: "select * from public.hq_tickets_pull()",
    resolve: "select public.hq_ticket_resolve($1::int, $2)",
    slug: "technology-associates",
  },
];

// Wiring used by run.mjs jobDeps. A missing URL skips that source; connect is injectable for tests.
export async function ticketsDeps(env, { connect, log = console.log } = {}) {
  connect ??= (await import("postgres")).default;
  const sources = [];
  for (const s of SOURCES) {
    if (!env[s.env]) {
      log(`tickets: ${s.env} is not set, skipping ${s.name}`);
      continue;
    }
    // max 1: the role is a pooler login with a small connection budget.
    const pg = connect(verifyFullUrl(env[s.env]), { max: 1, connect_timeout: 5, prepare: false });
    sources.push({
      name: s.name,
      pull: async () =>
        (await pg.unsafe(s.pull)).map((r) => ({ ...r, slug: r.slug ?? s.slug ?? null })),
      resolve: (id, text) => pg.unsafe(s.resolve, [id, text]),
      close: () => pg.end({ timeout: 5 }),
    });
  }
  return { sources };
}

const key = (src, r) => `ticket:${src}:${r.id}`;
const ms = (v) => (v == null ? NaN : new Date(v).getTime());

async function insertTask(sql, src, r) {
  const body = `${src} · ${r.severity}\n\n${r.body ?? ""}`.slice(0, BODY_MAX);
  try {
    await sql`
      insert into tasks (title, body, owners, area, status, source, client_slug, alert_key, due, via)
      values (${`Ticket: ${String(r.subject).slice(0, SUBJECT_MAX)}`}, ${body},
              '{nate}', 'ops', 'todo', 'alert', ${r.slug ?? null}, ${key(src, r)},
              (now() at time zone 'America/New_York')::date + 2, 'job')
    `;
    return true;
  } catch (e) {
    if (e?.code === "23505") return false; // tasks_alert_key_open_idx: an open task is already there
    throw e;
  }
}

async function syncSource(sql, s, out) {
  const rows = await s.pull();
  out.pulled += rows.length;
  if (!rows.length) return;
  const keys = rows.map((r) => key(s.name, r));
  // newest first, so the first row seen per key is the latest task
  const found = await sql`
    select id, status, alert_key, resolution, synced_at from tasks
    where alert_key = any(${keys}) order by created_at desc
  `;
  const latest = new Map();
  for (const t of found) if (!latest.has(t.alert_key)) latest.set(t.alert_key, t);

  let firstErr;
  for (const r of rows) {
    const t = latest.get(key(s.name, r));
    const closed = r.status === "closed";
    try {
      if (!t) {
        if (!closed && (await insertTask(sql, s.name, r))) out.created++;
      } else if (t.status !== "done") {
        if (closed) {
          await sql`update tasks set status = 'done', done_at = now(), synced_at = now(), updated_at = now() where id = ${t.id}`;
          out.closed++;
        }
      } else if (t.synced_at) {
        // reopened at the source after we closed it: a new task (the old one stays as history)
        if (!closed && ms(r.updated_at) > ms(t.synced_at) && (await insertTask(sql, s.name, r)))
          out.created++;
      } else {
        // done in HQ and owes the source its answer; a ticket closed meanwhile needs no push
        if (!closed) {
          await s.resolve(r.id, t.resolution ?? "");
          out.pushed++;
        }
        await sql`update tasks set synced_at = now(), updated_at = now() where id = ${t.id}`;
      }
    } catch (e) {
      // one bad ticket must not starve the rest of the source
      firstErr ??= e;
    }
  }
  if (firstErr) throw firstErr;
}

export async function run({ sql, sources = [] } = {}) {
  const out = { pulled: 0, created: 0, closed: 0, pushed: 0, failed: [] };
  const why = [];
  for (const s of sources) {
    try {
      await syncSource(sql, s, out);
    } catch (e) {
      out.failed.push(s.name);
      why.push(`${s.name}: ${String(e?.message ?? e)}`);
    } finally {
      await s.close?.().catch(() => {});
    }
  }
  if (out.failed.length)
    throw new Error(`tickets failed (${why.join("; ")}) ${JSON.stringify(out)}`);
  return out;
}
