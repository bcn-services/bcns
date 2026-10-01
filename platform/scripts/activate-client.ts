// activate-client --slug  (P1: a self-service sign-up starts `pending`; bcns flips it to active by hand.)
// pending -> active ONLY: any other starting status (active, paused, churned) is refused, so this can
// never resurrect a churned client or un-pause one by accident. Run against local or, by Nate, hosted
// (DATABASE_URL); never from an agent session against hosted.
import { parseArgs } from 'node:util'
import { die, pgClient, isMain, runMain } from './_lib.js'

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { slug: { type: 'string' } } })
  const { slug } = values
  if (!slug) die('usage: activate-client --slug <slug>')

  const db = pgClient()
  try {
    // The status test is in the UPDATE itself, so a concurrent status change cannot slip between a
    // read and the write.
    const r = await db.query<{ id: string }>(
      `update data.clients set status = 'active' where slug = $1 and status = 'pending' returning id`,
      [slug],
    )
    if (r.rowCount === 0) {
      const found = await db.query<{ status: string }>(`select status from data.clients where slug = $1`, [slug])
      if (found.rowCount === 0) die(`no client with slug ${slug}`)
      die(`${slug} is ${found.rows[0].status}, not pending: refusing to activate`)
    }
    console.log(`${slug} activated (${r.rows[0].id}). The owner gets tenant claims on their next sign-in or token refresh.`)
  } finally {
    await db.end()
  }
}

if (isMain(import.meta.url)) runMain(main)
