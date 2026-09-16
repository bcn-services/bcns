// set-quota --slug --gb <n>  (DESIGN.md §5.10: clients.egress_quota_bytes)
import { parseArgs } from 'node:util'
import { die, pgClient, isMain, runMain } from './_lib.js'

const GIB = 1024 ** 3

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { slug: { type: 'string' }, gb: { type: 'string' } } })
  const { slug, gb } = values
  if (!slug || !gb) die('usage: set-quota --slug <slug> --gb <n>')
  const bytes = Number(gb) * GIB
  if (!Number.isFinite(bytes) || bytes <= 0) die(`invalid --gb: ${gb}`)

  const db = pgClient()
  try {
    const r = await db.query('update data.clients set egress_quota_bytes = $2 where slug = $1', [slug, bytes])
    if (r.rowCount === 0) die(`no client with slug ${slug}`)
    console.log(`${slug} quota set to ${gb} GiB (${bytes} bytes)`)
  } finally {
    await db.end()
  }
}

if (isMain(import.meta.url)) runMain(main)
