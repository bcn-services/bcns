// export --slug --out <dir>  (DESIGN.md §5.10; task scope: JSON per canonical table, not CSV/raw/files)
import { parseArgs } from 'node:util'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { die, pgClient, clientIdForSlug, isMain, runMain } from './_lib.js'

// data.*'s canonical tables (§1.4). raw/raw_latest and originals are out of scope here (see NOTES).
const CANONICAL_TABLES = [
  'customers', 'jobs', 'messages', 'money', 'media', 'media_sets', 'media_set_items', 'products',
  'daily_metrics', 'records',
] as const

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { slug: { type: 'string' }, out: { type: 'string' } } })
  const { slug, out } = values
  if (!slug || !out) die('usage: export --slug <slug> --out <dir>')

  const db = pgClient()
  try {
    const clientId = await clientIdForSlug(db, slug)
    mkdirSync(out, { recursive: true })
    for (const table of CANONICAL_TABLES) {
      const r = await db.query(`select * from data.${table} where client_id = $1`, [clientId])
      writeFileSync(join(out, `${table}.json`), JSON.stringify(r.rows, null, 2))
    }
    console.log(`exported ${slug} to ${out}`)
  } finally {
    await db.end()
  }
}

if (isMain(import.meta.url)) runMain(main)
