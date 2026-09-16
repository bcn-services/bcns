// hard-delete --slug --confirm <slug>  (DESIGN.md §5.10, R36)
// Refuses unless status = churned and churned_at < now() − 90 days; exports to a temp dir, archives
// the tar.gz to Spaces bcns-exports/<slug>/<date>.tar.gz (or EXPORT_ARCHIVE_DIR locally), then deletes
// the Storage prefix (batches of 1,000), raw rows per partition in 50,000-row committed chunks, every
// data row, memberships, auth users. Each step is idempotent, so a failed run can simply be re-run.
// Canonical tables reference clients without ON DELETE CASCADE (§1.4 says nothing), hence the explicit
// per-table deletes before the client row.
import { parseArgs } from 'node:util'
import { execFileSync } from 'node:child_process'
import { copyFileSync, createReadStream, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { die, pgClient, serviceClient, isMain, runMain } from './_lib.js'
import { exportClient, rawPartitions, CANONICAL_TABLES } from './export.js'

// Reverse dependency order: items before sets, sets before media, everything before clients.
const DATA_TABLES = [
  'media_set_items', 'media_sets', 'media', 'daily_metrics', 'records', 'products', 'money', 'messages',
  'jobs', 'customers', 'raw_latest', 'download_tickets', 'egress_ledger', 'notifications', 'connector_runs',
  'connector_health', 'connector_schedule', 'source_tokens', 'dashboard_versions',
] as const

async function archive(slug: string, dir: string): Promise<string> {
  const name = `${new Date().toISOString().slice(0, 10)}.tar.gz`
  const tgz = join(tmpdir(), `${slug}-${name}`)
  execFileSync('tar', ['-czf', tgz, '-C', dir, '.'])
  const { SPACES_ENDPOINT, SPACES_KEY, SPACES_SECRET, SPACES_REGION, EXPORT_ARCHIVE_DIR } = process.env
  if (EXPORT_ARCHIVE_DIR) {
    mkdirSync(join(EXPORT_ARCHIVE_DIR, slug), { recursive: true })
    const dest = join(EXPORT_ARCHIVE_DIR, slug, name)
    copyFileSync(tgz, dest)
    return dest
  }
  if (!SPACES_ENDPOINT || !SPACES_KEY || !SPACES_SECRET) die('refuses: set SPACES_ENDPOINT/KEY/SECRET (or EXPORT_ARCHIVE_DIR) — the export must be archived first')
  const s3 = new S3Client({ endpoint: SPACES_ENDPOINT, region: SPACES_REGION ?? 'us-east-1',
    credentials: { accessKeyId: SPACES_KEY, secretAccessKey: SPACES_SECRET } })
  await s3.send(new PutObjectCommand({ Bucket: 'bcns-exports', Key: `${slug}/${name}`, Body: createReadStream(tgz) }))
  return `spaces://bcns-exports/${slug}/${name}`
}

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
      `select id, status = 'churned' and churned_at < now() - interval '90 days' as ok from data.clients where slug = $1`, [slug])
    if (found.rowCount === 0) die(`no client with slug ${slug}`)
    const { id: clientId, ok } = found.rows[0]
    if (!ok) die(`refuses: ${slug} must be churned for 90 days`)

    const tmp = mkdtempSync(join(tmpdir(), `bcns-export-${slug}-`))
    try {
      await exportClient(db, clientId, tmp)
      console.log(`archived export to ${await archive(slug, tmp)}`)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }

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
    for (const t of DATA_TABLES) await db.query(`delete from data.${t} where client_id = $1`, [clientId])
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
