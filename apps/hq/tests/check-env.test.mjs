import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("..", import.meta.url));
const run = (env) =>
  spawnSync(process.execPath, ["--import", "tsx", "scripts/check-env.ts"], {
    cwd,
    env: { PATH: process.env.PATH, ...env },
    encoding: "utf8",
  });
const HQ = "https://knmgyxlrhjxaydliucbs.supabase.co";

test("check-env exits 1 when SUPABASE_SERVICE_ROLE_KEY is set alongside a Supabase URL", () => {
  const r = run({ SUPABASE_SERVICE_ROLE_KEY: "x", NEXT_PUBLIC_SUPABASE_URL: HQ });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /SUPABASE_SERVICE_ROLE_KEY must not be set/);
});

test("check-env exits 0 with only the anon-side env, and with no env", () => {
  assert.equal(run({ NEXT_PUBLIC_SUPABASE_URL: HQ, NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" }).status, 0);
  assert.equal(run({}).status, 0);
});

test("check-env exits 1 when DATABASE_URL is set, with or without a Supabase URL", () => {
  for (const env of [
    { DATABASE_URL: "postgresql://postgres:pw@db.example:5432/postgres" },
    {
      DATABASE_URL: "postgresql://postgres:pw@db.example:5432/postgres",
      NEXT_PUBLIC_SUPABASE_URL: HQ,
    },
  ]) {
    const r = run(env);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /DATABASE_URL must not be set/);
    assert.doesNotMatch(r.stderr, /pw@/, "the value is never printed");
  }
  assert.equal(run({ DATABASE_URL: "  " }).status, 0, "blank is unset");
});

test("check-env exits 1 when NEXT_PUBLIC_SUPABASE_URL is not HQ's project host", () => {
  for (const url of [
    "https://cnsxbglhredokjbvudfd.supabase.co", // the client platform
    "https://knmgyxlrhjxaydliucbs.supabase.co.evil.test",
    "https://evil.test/knmgyxlrhjxaydliucbs.supabase.co",
    "http://knmgyxlrhjxaydliucbs.supabase.co", // http
    "http://x",
    "not a url",
  ]) {
    const r = run({ NEXT_PUBLIC_SUPABASE_URL: url });
    assert.equal(r.status, 1, url);
    assert.match(r.stderr, /NEXT_PUBLIC_SUPABASE_URL/, url);
  }
});

test("check-env passes HQ's project and a local stack", () => {
  for (const url of [HQ, `${HQ}/`, "http://127.0.0.1:55321", "http://localhost:55321"])
    assert.equal(run({ NEXT_PUBLIC_SUPABASE_URL: url }).status, 0, url);
});
