// Shared bits for scripts/*.ts (bcns-run operator CLIs). Nothing here that isn't used by 2+ scripts.
import { execSync } from 'node:child_process'
import pg from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Thrown by die(); the CLI runner in each script turns this into a stderr line + exit 1.
 *  Throwing (not process.exit) keeps main() safe to import and call from tests. */
export class ScriptError extends Error {}
export function die(message: string): never {
  throw new ScriptError(message)
}

export function dbUrl(): string {
  return process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
}

export function pgClient(): pg.Pool {
  return new pg.Pool({ connectionString: dbUrl(), max: 4 })
}

// .env.example ships no default service-role key (it's a secret). Fall back to the local stack's
// own key via `supabase status`, same as test/helpers.ts — never read .env.local.
let localServiceKey: string | undefined
function localKey(): string {
  if (!localServiceKey) {
    const s = JSON.parse(execSync('supabase status -o json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString())
    localServiceKey = s.SERVICE_ROLE_KEY as string
  }
  return localServiceKey
}

export function serviceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || localKey()
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function clientIdForSlug(db: pg.Pool, slug: string): Promise<string> {
  const r = await db.query<{ id: string }>('select id from data.clients where slug = $1', [slug])
  if (r.rowCount === 0) die(`no client with slug ${slug}`)
  return r.rows[0].id
}

/** True when this module was run directly (`tsx scripts/x.ts ...`), false when imported. */
export function isMain(moduleUrl: string): boolean {
  return process.argv[1] !== undefined && moduleUrl === `file://${process.argv[1]}`
}

export function runMain(main: (argv: string[]) => Promise<void>): void {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`error: ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  })
}
