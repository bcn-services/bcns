/** ops.test.mjs — fire rules (pure), the unavailable fire, and getFires() merging them with task fires. */
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const { opsFiresFrom, hqRuns, opsSnapshot, clearOpsMemo } = await import("../lib/ops.ts");

const NOW = new Date("2026-10-27T12:00:00Z");
const hours = (h) => new Date(NOW.getTime() - h * 3600_000).toISOString();
const empty = { health: [], runs: [], tickets: [], clients: [], failed: [] };
const h = (slug, source, status) => ({
  slug,
  source,
  status,
  status_since: "2026-10-20T00:00:00Z",
  last_run_at: null,
  last_success_at: null,
  has_error: status !== "ok",
});
const keys = (fs) => fs.map((f) => f.key).sort();

test("no problems, no fires", () => {
  assert.deepEqual(
    opsFiresFrom(
      { ...empty, health: [h("a", "shopify", "ok"), h("a", "meta", "never_ran")] },
      [],
      NOW
    ),
    []
  );
});

test("connector auth_failed / error / stale fire; ok and never_ran do not", () => {
  const fires = opsFiresFrom(
    {
      ...empty,
      health: [
        h("a", "shopify", "auth_failed"),
        h("a", "meta", "error"),
        h("b", "drive", "stale"),
        h("b", "monday", "ok"),
      ],
    },
    [],
    NOW
  );
  assert.deepEqual(keys(fires), [
    "ops:connector:a:meta",
    "ops:connector:a:shopify",
    "ops:connector:b:drive",
  ]);
  const sev = Object.fromEntries(fires.map((f) => [f.key, f.severity]));
  assert.equal(sev["ops:connector:b:drive"], "warn");
  assert.equal(sev["ops:connector:a:shopify"], "urgent");
  assert.ok(fires.every((f) => f.kind === "connector" && f.href === "/numbers#ops"));
});

test("HQ job failures count only inside the last 24h, grouped per job", () => {
  const runs = [
    { job: "digest", ok: false, at: hours(1), ms: 5, error: "boom" },
    { job: "digest", ok: false, at: hours(5), ms: 5, error: "boom again" },
    { job: "digest", ok: true, at: hours(2), ms: 5, error: null },
    { job: "old", ok: false, at: hours(30), ms: 5, error: "stale news" },
    { job: "fine", ok: true, at: hours(1), ms: 5, error: null },
  ];
  const fires = opsFiresFrom(empty, runs, NOW);
  assert.deepEqual(keys(fires), ["ops:job:digest"]);
  assert.match(fires[0].title, /digest failed 2x/);
  assert.equal(fires[0].detail, "boom");
});

test("only open urgent/high tickets fire", () => {
  const t = (id, severity, status = "open") => ({
    id,
    slug: "a",
    subject: `s${id}`,
    severity,
    status,
    created_at: "2026-10-26T00:00:00Z",
  });
  const fires = opsFiresFrom(
    {
      ...empty,
      tickets: [
        t("1", "urgent"),
        t("2", "high"),
        t("3", "normal"),
        t("4", "low"),
        t("5", "urgent", "closed"),
      ],
    },
    [],
    NOW
  );
  assert.deepEqual(keys(fires), ["ops:ticket:1", "ops:ticket:2"]);
});

test("a rejected platform query makes exactly one 'ops unavailable' fire", () => {
  const fires = opsFiresFrom({ ...empty, failed: ["health", "runs"] }, [], NOW);
  assert.equal(fires.length, 1);
  assert.deepEqual(
    [fires[0].key, fires[0].kind, fires[0].severity],
    ["ops:unavailable", "ops", "warn"]
  );
  assert.match(fires[0].detail, /health, runs/);
});

// --- the platform being slow or down must cost one bounded wait, not one per query per render ------

test("opsSnapshot: a query that never resolves settles at the deadline as one 'ops unavailable' fire", async () => {
  clearOpsMemo();
  const t0 = Date.now();
  const snap = await opsSnapshot({ deadlineMs: 40, load: () => new Promise(() => {}) });
  assert.ok(Date.now() - t0 < 2000, "settled at the deadline, not after the queries");
  assert.deepEqual(snap.failed, ["timeout"]);
  const fires = opsFiresFrom(snap, [], NOW);
  assert.deepEqual(
    fires.map((f) => f.key),
    ["ops:unavailable"]
  );
  assert.match(fires[0].detail, /timeout/);
  clearOpsMemo();
});

test("opsSnapshot: shared for 60s, failures included, then loaded again", async () => {
  clearOpsMemo();
  mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  try {
    let loads = 0;
    const load = async () => (loads++, { ...empty, failed: ["health"] });
    const [a, b] = await Promise.all([opsSnapshot({ load }), opsSnapshot({ load })]); // page + getFires
    assert.equal(loads, 1);
    assert.equal(a, b);
    mock.timers.tick(59_000);
    await opsSnapshot({ load });
    assert.equal(loads, 1, "still memoised, even though it failed");
    mock.timers.tick(2_000);
    await opsSnapshot({ load });
    assert.equal(loads, 2, "memo expired after 60s");
  } finally {
    mock.timers.reset();
    clearOpsMemo();
  }
});

test("opsSnapshot: a loader that throws is a failure, not a thrown render", async () => {
  clearOpsMemo();
  const snap = await opsSnapshot({
    load: async () => {
      throw new Error("boom");
    },
  });
  assert.deepEqual(snap.failed, ["query"]);
  clearOpsMemo();
});

test("hqRuns reads kind='run' events and maps detail.ok/ms/error", async () => {
  const seen = {};
  const build = (result) => {
    const chain = {
      select: (c) => ((seen.cols = c), chain),
      eq: (c, v) => ((seen.eq = [c, v]), chain),
      gte: (c, v) => ((seen.gte = [c, v]), chain),
      order: () => chain,
      limit: async () => result,
    };
    return { from: () => chain };
  };
  const runs = await hqRuns(
    build({
      data: [
        { job: "j1", detail: { ok: false, ms: 12, error: "x" }, created_at: hours(1) },
        { job: "j2", detail: { ok: true, ms: 3 }, created_at: hours(2) },
        { job: "j3", detail: null, created_at: hours(3) },
      ],
      error: null,
    }),
    hours(24)
  );
  assert.deepEqual(seen.eq, ["kind", "run"]);
  assert.deepEqual(
    runs.map((r) => [r.job, r.ok, r.ms, r.error]),
    [
      ["j1", false, 12, "x"],
      ["j2", true, 3, null],
      ["j3", false, null, null],
    ]
  );
  await assert.rejects(
    hqRuns(build({ data: null, error: { message: "denied" } }), hours(24)),
    /denied/
  );
});

// --- merge: getFires() = task fires + ops fires, a failing source never breaks the other -------------

test("getFires merges opsFires into the list; unset PLATFORM_OPS_URL is one 'ops unavailable' fire", async () => {
  clearOpsMemo();
  delete process.env.PLATFORM_OPS_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { getFires } = await import("../lib/fires.ts");
  const fires = await getFires();
  assert.deepEqual(
    fires.map((f) => f.key),
    ["ops:unavailable"]
  ); // taskFires() contributes [] on this base
  assert.match(fires[0].detail, /PLATFORM_OPS_URL/);
});

test("opsFires: an unreachable platform database is reported as unavailable, not thrown", async () => {
  clearOpsMemo(); // the previous test memoised the unset-URL failure
  process.env.PLATFORM_OPS_URL = "postgresql://hq_ops_ro:none@127.0.0.1:1/postgres?sslmode=disable"; // nothing listens on port 1
  const { opsFires } = await import("../lib/fires-ops.ts");
  const fires = await opsFires();
  assert.equal(fires.filter((f) => f.key === "ops:unavailable").length, 1);
  assert.match(fires[0].detail, /platform query failed/);
  delete process.env.PLATFORM_OPS_URL;
});
