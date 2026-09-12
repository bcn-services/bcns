// hard-delete --slug --confirm <slug> [--force]  (DESIGN.md §5.10, R36)
//
// NOTES / schema finding: DESIGN says "delete the client row (cascades)". `customers`, `jobs`,
// `messages`, `money`, `media`, `media_sets`, `media_set_items`, `products`, `daily_metrics`,
// `records` reference `data.clients(id)` WITHOUT `on delete cascade` (only memberships,
// source_tokens, dashboard_versions, connector_schedule, download_tickets, connector_runs,
// connector_health, egress_ledger do). `raw`/`raw_latest` have no FK at all. Deleting `clients`
// directly would fail with a foreign-key violation, so this script deletes those rows explicitly
// first. Needs Nate / a migration: add `on delete cascade` to those FKs.
// Also: `data.memberships` cascades on the `clients` side, but that only removes the membership
// ROW — the `auth.users` row it points to is untouched (there's no FK back from auth.users to
// clients for Postgres to cascade on). DESIGN's own full text ends "...then every data row,
// memberships, auth users", so this deletes each member's auth user explicitly (captured before
// the membership rows disappear). Without this, re-onboarding the same slug's smoke email fails
// with "already registered".
// Scope: this script does the DB+Storage deletion only. It does not run `export`/archive to Spaces
// first (task's own §5.10 description omits that step; R36's full archive-then-delete is not built).
import { parseArgs } from 'node:util'
import { die, pgClient, serviceClient, isMain, runMain } from './_lib.js'

// Tables with `client_id references data.clients(id)` but no ON DELETE CASCADE (see NOTES above).
const NON_CASCADING_TABLES = [
  'media_set_items', 'media_sets', 'media', 'daily_metrics', 'records', 'products', 'money',
  'messages', 'jobs', 'customers', 'raw', 'raw_latest',
] as const

async function deleteStoragePrefix(admin: ReturnType<typeof serviceClient>, clientId: string): Promise<number> {
  let deleted = 0
  for (const folder of ['orig', 'thumb']) {
    const { data: objects, error } = await admin.storage.from('media').list(`${clientId}/${folder}`, { limit: 10000 })
    if (error) die(`list ${folder}: ${error.message}`)
    const paths = (objects ?? []).map((o) => `${clientId}/${folder}/${o.name}`)
    for (let i = 0; i < paths.length; i += 1000) {
      const batch = paths.slice(i, i + 1000)
      const { error: rmError } = await admin.storage.from('media').remove(batch)
      if (rmError) die(`remove ${folder}: ${rmError.message}`)
      deleted += batch.length
    }
  }
  return deleted
}

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: { slug: { type: 'string' }, confirm: { type: 'string' }, force: { type: 'boolean' } },
  })
  const { slug, confirm } = values
  if (!slug || !confirm) die('usage: hard-delete --slug <slug> --confirm <slug> [--force]')
  if (confirm !== slug) die('--confirm must repeat --slug')

  const db = pgClient()
  try {
    const found = await db.query<{ id: string; status: string }>('select id, status from data.clients where slug = $1', [slug])
    if (found.rowCount === 0) die(`no client with slug ${slug}`)
    const { id: clientId, status } = found.rows[0]
    if (status !== 'churned' && !values.force) {
      die(`refuses: ${slug} is ${status}, not churned (pass --force on a non-production stack)`)
    }

    const admin = serviceClient()
    const objectsDeleted = await deleteStoragePrefix(admin, clientId)

    const members = await db.query<{ user_id: string }>('select user_id from data.memberships where client_id = $1', [clientId])

    for (const table of NON_CASCADING_TABLES) {
      await db.query(`delete from data.${table} where client_id = $1`, [clientId])
    }
    await db.query('delete from data.clients where id = $1', [clientId])

    for (const { user_id } of members.rows) {
      const { error } = await admin.auth.admin.deleteUser(user_id)
      if (error) console.error(`warning: could not delete auth user ${user_id}: ${error.message}`)
    }

    console.log(
      `hard-deleted ${slug}: ${objectsDeleted} storage objects, ${members.rowCount} auth user(s), client row + all data removed`,
    )
  } finally {
    await db.end()
  }
}

if (isMain(import.meta.url)) runMain(main)
