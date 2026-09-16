// import-media --slug --dir <folder> [--set <name>] [--tags a,b]  (DESIGN.md §5.10, §3.3 register_media)
import { parseArgs } from 'node:util'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { die, pgClient, serviceClient, clientIdForSlug, isMain, runMain } from './_lib.js'

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.pdf': 'application/pdf',
}

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: { slug: { type: 'string' }, dir: { type: 'string' }, set: { type: 'string' }, tags: { type: 'string' } },
  })
  const { slug, dir } = values
  if (!slug || !dir) die('usage: import-media --slug <slug> --dir <folder> [--set <name>] [--tags a,b]')
  const tags = (values.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean)

  const db = pgClient()
  try {
    const clientId = await clientIdForSlug(db, slug)
    const admin = serviceClient()

    let setId: string | undefined
    if (values.set) {
      const existing = await db.query<{ id: string }>('select id from data.media_sets where client_id = $1 and name = $2', [
        clientId,
        values.set,
      ])
      setId = existing.rows[0]?.id
      if (!setId) {
        const created = await db.query<{ id: string }>(
          'insert into data.media_sets (client_id, name) values ($1, $2) returning id',
          [clientId, values.set],
        )
        setId = created.rows[0].id
      }
    }

    const files = readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile())
    let imported = 0
    let skipped = 0
    for (const filename of files) {
      const filePath = join(dir, filename)
      const bytes = statSync(filePath).size

      const dup = await db.query<{ id: string }>(
        `select id from data.media where client_id = $1 and source = 'upload' and filename = $2 and bytes = $3`,
        [clientId, filename, bytes],
      )
      let mediaId = dup.rows[0]?.id
      if (mediaId) {
        skipped++
      } else {
        const ext = extname(filename).slice(1).toLowerCase() || 'bin'
        const path = `${clientId}/orig/${randomUUID()}.${ext}`
        const { error: uploadError } = await admin.storage
          .from('media')
          .upload(path, readFileSync(filePath), { contentType: MIME[extname(filename).toLowerCase()] ?? 'application/octet-stream' })
        if (uploadError) die(`upload ${filename}: ${uploadError.message}`)

        // register_media sets `filename` from `title` when given, so pass the original filename
        // (with extension) as title — otherwise filename would default to `<uuid>.<ext>` instead.
        const registered = await db.query<{ register_media: string }>(
          'select data.register_media($1, $2, $3, $4, null) as register_media',
          [clientId, path, filename, tags],
        )
        mediaId = registered.rows[0].register_media
        imported++
      }

      if (setId) {
        await db.query(
          `insert into data.media_set_items (client_id, set_id, media_id) values ($1, $2, $3) on conflict do nothing`,
          [clientId, setId, mediaId],
        )
      }
    }
    console.log(`imported ${imported}, skipped ${skipped} (already present) of ${files.length} files from ${dir}`)
  } finally {
    await db.end()
  }
}

if (isMain(import.meta.url)) runMain(main)
