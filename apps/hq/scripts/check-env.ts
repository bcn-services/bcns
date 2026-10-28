/**
 * check-env.ts — build gate (shared-platform mode is the only mode).
 *
 * A dashboard on the shared platform must never hold a service-role key: that
 * key bypasses RLS across EVERY client's rows. Fails the build if
 * SUPABASE_SERVICE_ROLE_KEY is set, in the shell env or in any .env file
 * `next build` would load. Also fails on a DATABASE_URL, and on a
 * NEXT_PUBLIC_SUPABASE_URL that is not HQ's own project (or a local stack).
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
const fail = (msg: string): never => {
  console.error(`check-env: ${msg}`);
  process.exit(1);
};

// Only a build that actually talks to the platform can leak through this key.
// A keyless local/CI build (no NEXT_PUBLIC_SUPABASE_URL) has nothing to bypass,
// and failing it would block `pnpm build` on a dev machine that happens to
// carry an unrelated service key in its shell.
if (config.supabaseUrl && config.hasServiceRoleKey) {
  fail(
    "SUPABASE_SERVICE_ROLE_KEY must not be set (it bypasses RLS for every client " +
      "on the shared platform). Remove it and rebuild."
  );
}

// HQ reads ops data through PLATFORM_OPS_URL (a SELECT-only role) and nothing else. A DATABASE_URL
// is a postgres-owner connection string (the jobs' jobs.env holds one); the web app must never have it.
if (process.env.DATABASE_URL?.trim()) {
  fail(
    "DATABASE_URL must not be set for the HQ web app (it is a database-owner credential; only the jobs use it)."
  );
}

// The anon key and cookie session must point at HQ's own project, never the client platform's.
// Unset passes (keyless CI build); a local stack passes (development).
const HQ_SUPABASE_HOST = "knmgyxlrhjxaydliucbs.supabase.co";
if (config.supabaseUrl) {
  let host = "";
  let protocol = "";
  try {
    ({ hostname: host, protocol } = new URL(config.supabaseUrl));
  } catch {
    fail("NEXT_PUBLIC_SUPABASE_URL is not a URL.");
  }
  const local = protocol === "http:" && (host === "127.0.0.1" || host === "localhost");
  if (!local && !(protocol === "https:" && host === HQ_SUPABASE_HOST)) {
    fail(
      `NEXT_PUBLIC_SUPABASE_URL must be https://${HQ_SUPABASE_HOST} (HQ's own project), got host "${host}".`
    );
  }
}
