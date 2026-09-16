/**
 * check-env.ts — build gate for shared-platform mode (bcns-data DESIGN.md §8).
 *
 * A dashboard on the shared platform must never hold a service-role key: that
 * key bypasses RLS across EVERY client's rows. Fails the build if
 * DATA_SOURCE=shared and SUPABASE_SERVICE_ROLE_KEY is set, in the shell env or
 * in any .env file `next build` would load. Own-project mode is not checked.
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
if (config.dataSource === "shared" && config.supabaseServiceRoleKey) {
  console.error(
    "check-env: SUPABASE_SERVICE_ROLE_KEY must not be set when DATA_SOURCE=shared " +
      "(it bypasses RLS for every client on the shared platform). Remove it and rebuild.",
  );
  process.exit(1);
}
