// churn --slug  (DESIGN.md §5.10: clients.status = churned; §5.10 R34 does the rest via the hook/claim query)
import { parseArgs } from 'node:util'
import { die, pgClient, isMain, runMain } from './_lib.js'

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { slug: { type: 'string' } } })
  const { slug } = values
  if (!slug) die('usage: churn --slug <slug>')

  const db = pgClient()
  try {
    const r = await db.query<{ id: string; churned_at: string }>(
      `update data.clients set status = 'churned' where slug = $1 returning id, churned_at`,
      [slug],
    )
    if (r.rowCount === 0) die(`no client with slug ${slug}`)
    console.log(`${slug} churned at ${r.rows[0].churned_at}`)
  } finally {
    await db.end()
  }
}

if (isMain(import.meta.url)) runMain(main)
