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

test("check-env exits 1 when SUPABASE_SERVICE_ROLE_KEY is set alongside a Supabase URL", () => {
  const r = run({ SUPABASE_SERVICE_ROLE_KEY: "x", NEXT_PUBLIC_SUPABASE_URL: "http://x" });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /SUPABASE_SERVICE_ROLE_KEY must not be set/);
});

test("check-env exits 0 with only the anon-side env, and with no env", () => {
  assert.equal(
    run({ NEXT_PUBLIC_SUPABASE_URL: "http://x", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" }).status,
    0
  );
  assert.equal(run({}).status, 0);
});
