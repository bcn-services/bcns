// §5.7 thumbnails, §5.9 purge and orphans. Both run under the housekeeping lease.
import sharp from 'sharp'
import { sql, storage } from './db.js'
import type { Tick } from './db.js'

interface Queued { id: string; client_id: string; storage_path: string }

/** Exactly the §1.4 queue index. thumb_error is its own column, so a re-upsert cannot re-queue a bad file. */
export async function thumbnails(t: Tick): Promise<number> {
  const q = await sql<Queued>(
    `select id, client_id, storage_path from data.media
     where thumb_path is null and kind = 'image' and deleted_at is null
       and storage_path is not null and thumb_error is null
     order by created_at limit 50`)
  if (q.rows.length) t.log('thumbnails', { queued: q.rows.length })
  let made = 0
  for (const m of q.rows) {
    try {
      const dl = await storage().download(m.storage_path)
      if (dl.error) throw new Error(dl.error.message)
      const input = Buffer.from(await dl.data.arrayBuffer())
      const meta = await sharp(input).metadata()
      const thumb = await sharp(input).rotate().resize({ width: 512, height: 512, fit: 'inside' }).jpeg({ quality: 80 }).toBuffer()
      const path = `${m.client_id}/thumb/${m.id}.jpg`
      const up = await storage().upload(path, thumb, { contentType: 'image/jpeg', upsert: true })
      if (up.error) throw new Error(up.error.message)
      await sql(`update data.media set thumb_path = $2, width = coalesce($3, width), height = coalesce($4, height) where id = $1`,
        [m.id, path, meta.width ?? null, meta.height ?? null])
      made++
    } catch (e) {
      await sql(`update data.media set thumb_error = $2 where id = $1`, [m.id, (e instanceof Error ? e.message : String(e)).slice(0, 500)])
    }
  }
  return made
}

export async function purge(t: Tick): Promise<number> {
  const doomed = await sql<{ id: string; storage_path: string | null; thumb_path: string | null }>(
    `select id, storage_path, thumb_path from data.media where purge_after < now() limit 200`)
  if (doomed.rows.length) {
    const paths = doomed.rows.flatMap(m => [m.storage_path, m.thumb_path].filter((p): p is string => !!p))
    if (paths.length) await storage().remove(paths)
    await sql(`delete from data.media where id = any($1::uuid[])`, [doomed.rows.map(m => m.id)])
  }

  // not exists, not NOT IN: media.storage_path is nullable (a Meta row before its download).
  const orphans = await sql<{ name: string }>(
    `select o.name from storage.objects o
     where o.bucket_id = 'media' and o.path_tokens[2] = 'orig' and o.created_at < now() - interval '24 hours'
       and not exists (select 1 from data.media m where m.storage_path = o.name)
     limit 200`)
  if (orphans.rows.length) await storage().remove(orphans.rows.map(o => o.name))

  await sql(`delete from data.download_tickets where expires_at < now() - interval '1 hour'`)
  await sql(`delete from data.connector_runs where id = any(array(
               select id from data.connector_runs where started_at < now() - interval '90 days' limit 5000))`)
  await sql(`delete from data.notifications where sent_at < now() - interval '180 days'`)
  const n = doomed.rows.length + orphans.rows.length
  if (n) t.log('purge', { media: doomed.rows.length, orphans: orphans.rows.length })
  return n
}
