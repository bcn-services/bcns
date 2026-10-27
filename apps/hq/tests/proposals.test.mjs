/**
 * proposals.test.mjs — propose() row shape (fake client), the diff view helpers, decideProposal's
 * single RPC path, and an integration pass of decide_proposal against the local HQ stack
 * (127.0.0.1:55322; skipped with a printed message when unreachable). The integration runs in one
 * psql transaction that is rolled back, so it leaves no rows behind.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fakeSb } from "./_fake-sb.mjs";

const T = await import("../lib/tasks.ts");
const P = await import("../lib/proposals.ts");
const ACTOR = "00000000-0000-4000-8000-000000000001";
const root = fileURLToPath(new URL("../", import.meta.url));

test("propose inserts a pending row with via, created_by and the compare-and-set old value", async () => {
  const sb = fakeSb();
  const row = await T.propose(sb, ACTOR, "mcp", {
    kind: "lead_stage",
    targetId: "22222222-2222-4222-8222-222222222222",
    field: "stage",
    old: "new",
    new: "contacted",
    reason: "  called twice ",
  });
  const p = sb.db.proposals[0];
  assert.equal(row.id, p.id);
  assert.equal(p.status, "pending");
  assert.equal(p.via, "mcp");
  assert.equal(p.created_by, ACTOR);
  assert.equal(p.kind, "lead_stage");
  assert.equal(p.old, "new");
  assert.equal(p.new, "contacted");
  assert.equal(p.reason, "called twice");
  assert.equal(sb.db.events[0].kind, "proposal.created");
  await assert.rejects(
    () =>
      T.propose(sb, ACTOR, "ui", { kind: "delete_lead", targetId: "x", field: "stage", new: "x" }),
    /kind/
  );
});

test("diff view helpers", () => {
  assert.equal(P.ageLabel("2026-10-27T10:00:00Z", new Date("2026-10-27T10:30:00Z")), "30m");
  assert.equal(P.ageLabel("2026-10-27T10:00:00Z", new Date("2026-10-27T15:00:00Z")), "5h");
  assert.equal(P.ageLabel("2026-10-25T10:00:00Z", new Date("2026-10-27T15:00:00Z")), "2d");
  assert.equal(P.whoLabel("nate", "mcp"), "Claude (nate)");
  assert.equal(P.whoLabel("nate", "ui"), "nate");
  assert.equal(P.fmtValue("stage", null), "—");
});

test("listPendingProposals returns old -> new with the target business name", async () => {
  const biz = "33333333-3333-4333-8333-333333333333";
  const sb = fakeSb({
    proposals: [
      {
        id: "p1",
        kind: "lead_stage",
        target_id: biz,
        field: "stage",
        old: "new",
        new: "contacted",
        reason: "r",
        status: "pending",
        created_by: ACTOR,
        via: "mcp",
        created_at: "2026-10-27T10:00:00Z",
      },
      {
        id: "p2",
        kind: "lead_stage",
        target_id: biz,
        field: "stage",
        old: "a",
        new: "b",
        status: "approved",
        created_at: "2026-10-27T10:00:00Z",
      },
    ],
    businesses: [{ id: biz, name: "hq4-Test Roofing" }],
    profiles: [{ id: ACTOR, handle: "nate" }],
  });
  const v = await P.listPendingProposals(sb, new Date("2026-10-27T12:00:00Z"));
  assert.equal(v.length, 1);
  assert.equal(v[0].target, "hq4-Test Roofing");
  assert.equal(v[0].old, "new");
  assert.equal(v[0].next, "contacted");
  assert.equal(v[0].who, "Claude (nate)");
});

test("decideProposal calls rpc('decide_proposal') and nothing writes proposals but propose() insert", () => {
  const actions = readFileSync(root + "app/(app)/work/actions.ts", "utf8");
  assert.match(actions, /\.rpc\("decide_proposal", \{ p_id: id, p_approve: approve \}\)/);
  const files = ["app", "lib", "components"].flatMap((d) =>
    readdirSync(root + d, { recursive: true })
      .filter((n) => /\.tsx?$/.test(n))
      .map((n) => root + d + "/" + n)
  );
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /from\(["']proposals["']\)\s*\.(update|delete|upsert)/, f);
  }
});

// ---- integration ------------------------------------------------------------------------------
const PSQL = ["/opt/homebrew/bin/psql", "psql"];
const URL_ = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
function psql(sql) {
  for (const bin of PSQL) {
    const r = spawnSync(bin, [URL_, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], {
      input: sql,
      encoding: "utf8",
      timeout: 20000,
    });
    if (r.error && r.error.code === "ENOENT") continue;
    return r;
  }
  return { error: new Error("no psql") };
}
const probe = psql("select 1");
const up = !probe.error && probe.status === 0 && probe.stdout.trim() === "1";
if (!up)
  console.log(
    "proposals integration: SKIPPED (local HQ stack at 127.0.0.1:55322 or psql unreachable)"
  );

const UID = "44444444-4444-4444-8444-444444444444";
const BIZ = "55555555-5555-4555-8555-555555555555";
// Runs `body` as the signed-in profile, inside a transaction that is always rolled back.
function asUser(body) {
  const r = psql(`
begin;
insert into auth.users (id, email) values ('${UID}', 'hq4-test@example.invalid');
insert into profiles (id, email, display_name, handle, role) values ('${UID}', 'hq4-test@example.invalid', 'hq4', 'nate', 'admin');
insert into businesses (id, name, stage) values ('${BIZ}', 'hq4-Test Roofing', 'qualified');
set local role authenticated;
set local request.jwt.claims = '{"sub":"${UID}"}';
${body}
rollback;`);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim().split("\n").filter(Boolean);
}

test(
  "integration: approving a lead_stage proposal changes businesses.stage",
  { skip: !up },
  async () => {
    const sb = fakeSb();
    await T.propose(sb, UID, "mcp", {
      kind: "lead_stage",
      targetId: BIZ,
      field: "stage",
      old: "qualified",
      new: "call_due",
      reason: "test",
    });
    const p = sb.captured.find((c) => c.table === "proposals").payload;
    const out = asUser(`
insert into proposals (kind, target_id, field, old, new, reason, status, created_by, via)
  values ('${p.kind}', '${p.target_id}', '${p.field}', '${JSON.stringify(p.old)}'::jsonb, '${JSON.stringify(p.new)}'::jsonb, '${p.reason}', '${p.status}', '${p.created_by}', '${p.via}');
select public.decide_proposal((select id from proposals where target_id = '${BIZ}'), true);
select stage from businesses where id = '${BIZ}';
select status from proposals where target_id = '${BIZ}';`);
    // psql -t -A prints "INSERT 0 1"-less output with -q; the three selects are the last three lines
    assert.deepEqual(out.slice(-3), ["approved", "call_due", "approved"]);
  }
);

test(
  "integration: a stale proposal returns 'stale' and leaves the lead unchanged",
  { skip: !up },
  async () => {
    const out = asUser(`
insert into proposals (kind, target_id, field, old, new, status, created_by, via)
  values ('lead_stage', '${BIZ}', 'stage', '"call_due"'::jsonb, '"won"'::jsonb, 'pending', '${UID}', 'mcp');
select public.decide_proposal((select id from proposals where target_id = '${BIZ}'), true);
select stage from businesses where id = '${BIZ}';
select status from proposals where target_id = '${BIZ}';`);
    assert.deepEqual(out.slice(-3), ["stale", "qualified", "stale"]);
  }
);

test(
  "integration: reject never touches the lead; a decided proposal cannot be decided again",
  { skip: !up },
  async () => {
    const out = asUser(`
insert into proposals (kind, target_id, field, old, new, status, created_by, via)
  values ('lead_stage', '${BIZ}', 'stage', '"qualified"'::jsonb, '"won"'::jsonb, 'pending', '${UID}', 'ui');
select public.decide_proposal((select id from proposals where target_id = '${BIZ}'), false);
select stage from businesses where id = '${BIZ}';`);
    assert.deepEqual(out.slice(-2), ["rejected", "qualified"]);
    const again = psql(`
begin;
insert into auth.users (id, email) values ('${UID}', 'hq4-test@example.invalid');
insert into profiles (id, email, display_name, handle, role) values ('${UID}', 'x', 'hq4', 'nate', 'admin');
insert into businesses (id, name) values ('${BIZ}', 'hq4-Test Roofing');
insert into proposals (id, kind, target_id, field, old, new, status, created_by) values ('66666666-6666-4666-8666-666666666666', 'lead_stage', '${BIZ}', 'stage', '"qualified"', '"won"', 'approved', '${UID}');
set local role authenticated;
set local request.jwt.claims = '{"sub":"${UID}"}';
select public.decide_proposal('66666666-6666-4666-8666-666666666666', true);
rollback;`);
    assert.notEqual(again.status, 0);
    assert.match(again.stderr, /not pending/);
  }
);

test("integration: authenticated cannot UPDATE proposals directly", { skip: !up }, async () => {
  const r = psql(`
begin;
insert into auth.users (id, email) values ('${UID}', 'hq4-test@example.invalid');
insert into profiles (id, email, display_name, handle, role) values ('${UID}', 'x', 'hq4', 'nate', 'admin');
insert into businesses (id, name) values ('${BIZ}', 'hq4-Test Roofing');
insert into proposals (id, kind, target_id, field, old, new, status, created_by) values ('77777777-7777-4777-8777-777777777777', 'lead_stage', '${BIZ}', 'stage', '"qualified"', '"won"', 'pending', '${UID}');
set local role authenticated;
set local request.jwt.claims = '{"sub":"${UID}"}';
update proposals set status = 'approved' where id = '77777777-7777-4777-8777-777777777777';
rollback;`);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /permission denied/);
});
