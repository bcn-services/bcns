// The deliverables queries of lib/db.mjs against a real local Postgres, run as the
// hq_jobs role of 0032's comment block (SET LOCAL ROLE, so its grants and RLS policies
// apply). Every case runs in one transaction that is rolled back: no rows are left.
//
// Skips, with a printed reason, unless the local hq stack (apps/hq: supabase start,
// DB on 127.0.0.1:55322, or HQ_TEST_DATABASE_URL), migration 0032 and the hq_jobs
// role are all there. The role is NOT created by a migration; to run this locally,
// apply the comment block at the bottom of 0032 by hand (any password), plus
// `grant hq_jobs to postgres with set true, inherit false;` so the local postgres
// login may SET ROLE to it, then `supabase db reset --workdir apps/hq` afterwards
// to drop it again.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import postgres from "postgres";
import { claimDeliverable, failStaleDeliverables, otherRunning, requeueDeliverable, finishDeliverable } from "../lib/db.mjs";

const URL_ = process.env.HQ_TEST_DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
let sql;
let skip = false;
try {
  sql = postgres(URL_, { max: 1, connect_timeout: 2, onnotice: () => {} });
  const [r] = await sql`
    select to_regclass('public.deliverables') is not null as t,
           exists (select 1 from pg_roles where rolname = 'hq_jobs') as r`;
  if (!r.t) skip = "no deliverables table (0032 not applied)";
  else if (!r.r) skip = "no hq_jobs role (apply the comment block at the bottom of 0032 first)";
} catch (err) {
  skip = `local hq Postgres unreachable (${String(err?.code ?? err?.message).slice(0, 60)})`;
}
if (skip) console.log(`# db-deliverables: skipped, ${skip}`);

const ROLLBACK = Symbol("rollback");
// fn(tx, ids) runs as hq_jobs on a user + rows seeded as the superuser.
async function asJobs(seed, fn) {
  try {
    await sql.begin(async (tx) => {
      const [{ uid }] = await tx`insert into auth.users (id, email) values (gen_random_uuid(), 'qa-' || gen_random_uuid() || '@example.invalid') returning id as uid`;
      await tx`insert into profiles (id, email) values (${uid}, 'qa@example.invalid')`;
      // Park any real running rows (rolled back with the rest) so "other running" is deterministic.
      await tx`update deliverables set status = 'done' where status = 'running'`;
      const ids = {};
      for (const [name, { status, startedAgo, created = "1970-01-01" }] of Object.entries(seed)) {
        const [{ id }] = await tx`
          insert into deliverables (slug, kind, status, requested_by, started_at, created_at)
          values (${"qa-" + name}, 'pitch', ${status},
                  ${uid}, ${startedAgo ? tx`now() - ${startedAgo}::interval` : null}, ${created}::timestamptz)
          returning id`;
        ids[name] = id;
      }
      await tx`set local role hq_jobs`;
      await fn(tx, ids);
      throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
}
const row = async (tx, id) => (await tx`select status, error, started_at, finished_at, paths from deliverables where id = ${id}`)[0];

test("failStaleDeliverables: running > 30 min becomes failed 'stale run'; fresh running, 29 min, queued and done rows are untouched", { skip }, async () => {
  await asJobs(
    { stale: { status: "running", startedAgo: "31 minutes" }, old: { status: "running", startedAgo: "3 hours" }, fresh: { status: "running", startedAgo: "1 minute" }, edge: { status: "running", startedAgo: "29 minutes" }, queued: { status: "queued" }, done: { status: "done", startedAgo: "5 hours" } },
    async (tx, id) => {
      const got = (await failStaleDeliverables(tx)).map((r) => r.id);
      assert.ok(got.includes(id.stale) && got.includes(id.old), "stale rows are returned");
      for (const k of ["fresh", "edge", "queued", "done"]) assert.ok(!got.includes(id[k]), `${k} not returned`);
      for (const k of ["stale", "old"]) {
        const r = await row(tx, id[k]);
        assert.equal(r.status, "failed");
        assert.equal(r.error, "stale run");
        assert.ok(r.finished_at, "finished_at set");
      }
      assert.equal((await row(tx, id.fresh)).status, "running");
      assert.equal((await row(tx, id.fresh)).error, null);
      assert.equal((await row(tx, id.edge)).status, "running");
      assert.equal((await row(tx, id.queued)).status, "queued");
      assert.equal((await row(tx, id.done)).status, "done");
    },
  );
});

test("otherRunning: sees a different running row, never the row asked about, ignores queued/done/failed", { skip }, async () => {
  await asJobs(
    { a: { status: "running", startedAgo: "2 minutes" }, q: { status: "queued" }, d: { status: "done", startedAgo: "1 hour" }, f: { status: "failed", startedAgo: "1 hour" } },
    async (tx, id) => {
      assert.deepEqual((await otherRunning(tx, id.q)).map((r) => r.id), [id.a], "asking as the queued row: the running one is 'other'");
      assert.deepEqual([...(await otherRunning(tx, id.a))], [], "asking as the only running row: nobody else is running");
      assert.deepEqual((await otherRunning(tx, id.d)).map((r) => r.id), [id.a], "a done row asking: still sees a");
    },
  );
});

test("requeueDeliverable: a running row returns to queued with started_at cleared; a done/failed/queued row is not touched", { skip }, async () => {
  await asJobs(
    { run: { status: "running", startedAgo: "1 minute" }, done: { status: "done", startedAgo: "1 hour" }, failed: { status: "failed", startedAgo: "1 hour" }, queued: { status: "queued" } },
    async (tx, id) => {
      assert.deepEqual((await requeueDeliverable(tx, id.run)).map((r) => r.id), [id.run]);
      const r = await row(tx, id.run);
      assert.equal(r.status, "queued");
      assert.equal(r.started_at, null);
      for (const k of ["done", "failed", "queued"]) {
        assert.deepEqual([...(await requeueDeliverable(tx, id[k]))], [], `${k} untouched`);
      }
      assert.equal((await row(tx, id.done)).status, "done");
      assert.equal((await row(tx, id.failed)).status, "failed");
      // and it is claimable again, oldest first
      const [claimed] = await claimDeliverable(tx);
      assert.ok(claimed, "something claimable");
    },
  );
});

test("claimDeliverable + finishDeliverable as hq_jobs: oldest queued -> running with started_at, then done with paths", { skip }, async () => {
  await asJobs(
    { first: { status: "queued", created: "1969-01-01" }, second: { status: "queued", created: "1969-01-02" } },
    async (tx, id) => {
      const [claimed] = await claimDeliverable(tx);
      assert.equal(claimed.id, id.first, "oldest queued row first");
      assert.equal(claimed.status, "running");
      assert.ok(claimed.started_at);
      assert.equal((await row(tx, id.second)).status, "queued");
      await finishDeliverable(tx, id.first, { status: "done", paths: ["clients/qa-first/demo/demo.html"], error: null });
      const r = await row(tx, id.first);
      assert.equal(r.status, "done");
      assert.deepEqual(r.paths, ["clients/qa-first/demo/demo.html"]);
      assert.ok(r.finished_at);
    },
  );
});

test("hq_jobs is still least-privilege: no insert or delete on deliverables (control that SET ROLE is in effect)", { skip }, async () => {
  await asJobs({ x: { status: "queued" } }, async (tx, id) => {
    await tx`savepoint s1`;
    await assert.rejects(tx`delete from deliverables where id = ${id.x}`, /permission denied/);
    await tx`rollback to savepoint s1`;
    await tx`savepoint s2`;
    await assert.rejects(tx`select * from finance_inputs limit 1`, /permission denied/);
    await tx`rollback to savepoint s2`;
  });
});

after(() => sql?.end({ timeout: 2 }));
