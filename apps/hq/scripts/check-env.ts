/**
 * check-env.ts — build gate (shared-platform mode is the only mode).
 *
 * A dashboard on the shared platform must never hold a service-role key: that
 * key bypasses RLS across EVERY client's rows. Fails the build if
 * SUPABASE_SERVICE_ROLE_KEY is set, in the shell env or in any .env file
 * `next build` would load.
 */

import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { getConfig } from "../lib/env";

// Same files `next build` loads; shell env wins over all of them.
const fromFiles: Record<string, string> = {};
for (const f of [".env", ".env.production", ".env.local", ".env.production.local"]) {
  if (existsSync(f)) Object.assign(fromFiles, parseEnv(readFileSync(f, "utf8")));
}
for (const [k, v] of Object.entries(fromFiles)) process.env[k] ??= v;

const config = getConfig();
// Only a build that actually talks to the platform can leak through this key.
// A keyless local/CI build (no NEXT_PUBLIC_SUPABASE_URL) has nothing to bypass,
// and failing it would block `pnpm build` on a dev machine that happens to
// carry an unrelated service key in its shell.
if (config.supabaseUrl && config.hasServiceRoleKey) {
  console.error(
    "check-env: SUPABASE_SERVICE_ROLE_KEY must not be set (it bypasses RLS for every client " +
      "on the shared platform). Remove it and rebuild.",
  );
  process.exit(1);
}
