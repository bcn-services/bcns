/**
 * calls.integration.test.mjs — logCall against the LOCAL HQ stack, as a real signed-in HQ user.
 * Skips (printed) when 127.0.0.1:55321/55322 is unreachable. Start it with `supabase start --workdir apps/hq`.
 * Keys come from `supabase status` at runtime: never written to a file, never printed.
 * Fixtures are `hq3-` prefixed, invented, and removed afterwards as postgres.
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const DB = process.env.HQ_TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const APP_DIR = fileURLToPath(new URL("..", import.meta.url));

const up = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port, timeout: 800 });
    s.once("connect", () => (s.destroy(), resolve(true)));
    s.once("error", () => resolve(false));
    s.once("timeout", () => (s.destroy(), resolve(false)));
  });

const reachable = (await up(55322)) && (await up(55321));
if (!reachable) console.log("calls.integration: SKIPPED - local HQ stack (127.0.0.1:55321 / 55322) is not running");

const psql = (sql) => execFileSync("psql", [DB, "-v", "ON_ERROR_STOP=1", "-Atq", "-c", sql], { encoding: "utf8" }).trim();

const { logCall, loadBrandonToday } = await import("../lib/leads.ts");

const tag = `hq3-${randomUUID().slice(0, 8)}`;
const email = `${tag}@example.test`;
let userId = null;

after(() => {
  if (!reachable) return;
  const ids = `(select id from businesses where name like '${tag}%')`;
  psql(`delete from events where detail->>'business_id' in (select id::text from businesses where name like '${tag}%');
        delete from calls where business_id in ${ids};
        delete from notes where business_id in ${ids};
        delete from links where business_id in ${ids};
        delete from businesses where name like '${tag}%';
        delete from profiles where email = '${email}';
        delete from auth.users where email = '${email}';`);
});

test("logCall as a signed-in HQ user writes one calls row + one events row (ui) and moves the stage", { skip: !reachable }, async (t) => {
  const env = Object.fromEntries(
    execFileSync("supabase", ["status", "--workdir", APP_DIR, "-o", "env"], { encoding: "utf8" })
      .split("\n")
      .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]])
  );
  const api = env.API_URL;
  const anon = env.ANON_KEY;
  const admin = env.SERVICE_ROLE_KEY ?? env.SECRET_KEY;
  assert.ok(api && anon && admin, "local stack keys available");

  // a user that exists in auth, with an HQ profile (handle brandon) - minted via admin generate_link, no password or email
  const gl = await fetch(`${api}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: admin, authorization: `Bearer ${admin}`, "content-type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  assert.equal(gl.status, 200, "generate_link");
  const link = await gl.json();
  userId = link.id ?? link.user?.id;
  assert.ok(userId && link.hashed_token);
  if (psql(`select count(*) from profiles where handle = 'brandon'`) !== "0") {
    // handle is unique and the shared local stack may hold another item's brandon: skip, don't fail
    console.log("calls.integration: SKIPPED - a 'brandon' profile already exists on the shared local stack");
    t.skip("another brandon profile exists");
    return;
  }
  psql(`insert into profiles (id, email, handle, role) values ('${userId}', '${email}', 'brandon', 'staff')`);

  const A = `${tag}-alpha`;
  const B = `${tag}-bravo`;
  const ida = psql(`insert into businesses (name, stage, assigned_to, trade, town, research) values ('${A}', 'call_due', 'brandon', 'Plumbing', 'Salem', '{"fit_score": 81}'::jsonb) returning id`).split("\n")[0];
  const idb = psql(`insert into businesses (name, stage, assigned_to, trade, town, research) values ('${B}', 'call_due', 'brandon', 'HVAC', 'Lynn', '{"fit_score": 42}'::jsonb) returning id`).split("\n")[0];

  const sb = createClient(api, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: vErr } = await sb.auth.verifyOtp({ token_hash: link.hashed_token, type: link.verification_type ?? "magiclink" });
  assert.equal(vErr, null, "session minted");
  // the local stack's token iat can land a beat ahead of PostgREST's clock ("JWT issued at future"); wait it out
  // (a fixed sleep flaked once under a full-gate run: poll until PostgREST accepts the token)
  for (let i = 0; i < 40; i++) {
    const { error } = await sb.from("profiles").select("id").limit(1);
    if (!error || !/issued at future/i.test(error.message)) break;
    await new Promise((r) => setTimeout(r, 250));
  }

  // Today sees both, best fit first (RLS as the user)
  const before = await loadBrandonToday(sb, "brandon", { all: true });
  const mine = before.calls.filter((l) => l.name.startsWith(tag)).map((l) => l.name);
  assert.deepEqual(mine, [A, B]);

  // outcome 2 (no answer): attempted + a follow-up two business days out
  const actor = { id: userId, handle: "brandon" };
  const r = await logCall(sb, actor, "ui", { businessId: ida, outcome: 2, note: "left a voicemail" });
  assert.equal(r.stage, "attempted");
  assert.equal(psql(`select count(*) from calls where business_id = '${ida}'`), "1");
  assert.equal(psql(`select outcome||'|'||by||'|'||via||'|'||coalesce(note,'') from calls where business_id = '${ida}'`), "no_answer|brandon|ui|left a voicemail");
  assert.equal(psql(`select count(*) from events where detail->>'business_id' = '${ida}'`), "1");
  assert.equal(psql(`select via||'|'||kind||'|'||actor from events where detail->>'business_id' = '${ida}'`), `ui|call_logged|${userId}`);
  assert.equal(psql(`select stage from businesses where id = '${ida}'`), "attempted");
  const dow = psql(`select extract(isodow from next_contact_at at time zone 'America/New_York') from businesses where id = '${ida}'`);
  assert.ok(Number(dow) >= 1 && Number(dow) <= 5, `follow-up lands on a weekday (isodow ${dow})`);
  // a retry of the same call a moment later (same stage, so the stage CAS alone would let it through) is refused
  await assert.rejects(() => logCall(sb, actor, "ui", { businessId: ida, outcome: 2 }), /already logged/);
  assert.equal(psql(`select count(*) from calls where business_id = '${ida}'`), "1");
  assert.equal(psql(`select count(*) from events where detail->>'business_id' = '${ida}'`), "1");
  // the other lead is untouched
  assert.equal(psql(`select count(*) from calls where business_id = '${idb}'`), "0");
  assert.equal(psql(`select stage from businesses where id = '${idb}'`), "call_due");

  // outcome 3 (consult booked): consult_scheduled with consult_at; a second logCall on a non-loggable stage is refused and writes nothing
  const at = new Date(Date.now() + 3 * 86400_000).toISOString();
  const r3 = await logCall(sb, actor, "ui", { businessId: idb, outcome: 3, consultAt: at });
  assert.equal(r3.stage, "consult_scheduled");
  assert.equal(psql(`select stage||'|'||(consult_at is not null) from businesses where id = '${idb}'`), "consult_scheduled|true");
  await assert.rejects(() => logCall(sb, actor, "ui", { businessId: idb, outcome: 1 }), /cannot log/);
  assert.equal(psql(`select count(*) from calls where business_id = '${idb}'`), "1");
  assert.equal(psql(`select count(*) from events where detail->>'business_id' = '${idb}'`), "1");

  // Today: A is a follow-up only once due, B is under consults
  const afterT = await loadBrandonToday(sb, "brandon", { all: true });
  assert.ok(!afterT.followups.some((l) => l.name === A), "attempted lead is not due for two business days");
  psql(`update businesses set next_contact_at = now() - interval '1 hour' where id = '${ida}'`);
  assert.ok((await loadBrandonToday(sb, "brandon", { all: true })).followups.some((l) => l.name === A), "due once its date passes");
  assert.ok(afterT.consults.some((l) => l.name === B));
  assert.ok(!afterT.calls.some((l) => l.name.startsWith(tag)));
  assert.ok(afterT.allTime >= 2);
});
