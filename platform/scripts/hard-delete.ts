// hard-delete --slug --confirm <slug>  (DESIGN.md §5.10, R36)
// Refuses unless status = churned and churned_at < now() − 30 days; deletes the Storage prefix
// (batches of 1,000), raw rows per partition in 50,000-row committed chunks, every data row,
// memberships, auth users. Each step is idempotent, so a failed run can simply be re-run.
// Canonical tables reference clients without ON DELETE CASCADE (§1.4 says nothing), hence the explicit
// per-table deletes before the client row. No pre-delete archive: Shopify §6.2.3 and monday.com §7(e)
// require every copy gone within 30 days of uninstall, so an indefinite export archive would violate
// that. Export-on-request during the 30-day window is unaffected (scripts/export.ts).
import { parseArgs } from 'node:util'
import { die, pgClient, serviceClient, isMain, runMain } from './_lib.js'
import { deleteClientRows, rawPartitions } from '../worker/src/scope.js'

async function deleteStoragePrefix(admin: ReturnType<typeof serviceClient>, clientId: string): Promise<number> {
  const bucket = admin.storage.from('media')
  let deleted = 0
  for (const folder of ['orig', 'thumb']) {
    for (;;) {
      const { data, error } = await bucket.list(`${clientId}/${folder}`, { limit: 1000 })
      if (error) die(`list ${folder}: ${error.message}`)
      const paths = (data ?? []).filter((o) => o.id).map((o) => `${clientId}/${folder}/${o.name}`)
      if (!paths.length) break
      const { error: rm } = await bucket.remove(paths)
      if (rm) die(`remove ${folder}: ${rm.message}`)
      deleted += paths.length
    }
  }
  return deleted
}

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { slug: { type: 'string' }, confirm: { type: 'string' } } })
  const { slug, confirm } = values
  if (!slug || !confirm) die('usage: hard-delete --slug <slug> --confirm <slug>')
  if (confirm !== slug) die('--confirm must repeat --slug')

  const db = pgClient()
  try {
    const found = await db.query<{ id: string; ok: boolean }>(
      `select id, status = 'churned' and churned_at < now() - interval '30 days' as ok from data.clients where slug = $1`, [slug])
    if (found.rowCount === 0) die(`no client with slug ${slug}`)
    const { id: clientId, ok } = found.rows[0]
    if (!ok) die(`refuses: ${slug} must be churned for 30 days`)

    const admin = serviceClient()
    const objects = await deleteStoragePrefix(admin, clientId)

    for (const part of await rawPartitions(db)) {
      for (;;) {
        const r = await db.query(
          `delete from data.${part} where ctid = any(array(select ctid from data.${part} where client_id = $1 limit 50000))`, [clientId])
        if (!r.rowCount) break
      }
    }
    const members = await db.query<{ user_id: string }>('select user_id from data.memberships where client_id = $1', [clientId])
    await deleteClientRows(db, clientId)
    await db.query('delete from data.memberships where client_id = $1', [clientId])
    await db.query('delete from data.clients where id = $1', [clientId])
    for (const { user_id } of members.rows) {
      const { error } = await admin.auth.admin.deleteUser(user_id)
      if (error) console.error(`warning: auth user ${user_id}: ${error.message}`)
    }
    console.log(`hard-deleted ${slug}: ${objects} storage objects, ${members.rowCount} auth user(s), all rows`)
  } finally {
    await db.end()
  }
}

if (isMain(import.meta.url)) runMain(main)
