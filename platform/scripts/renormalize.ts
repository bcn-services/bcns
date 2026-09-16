// renormalize [--client <slug>] [--source <s>]  (DESIGN.md §5.8, §5.10)
// Sets connector_schedule.renormalize_requested_at = now() for a client/source, or all rows when
// --client is omitted. Actually re-driving normalize is the worker's job (§5.8); not built here.
// NOTES: §5.8's `--since <date>` isn't implemented — renormalize_cursor is a keyset position
// (entity, external_id), not a date, and no worker exists yet to consume it. Add when it does.
import { parseArgs } from 'node:util'
import { pgClient, clientIdForSlug, isMain, runMain } from './_lib.js'

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { client: { type: 'string' }, source: { type: 'string' } } })

  const db = pgClient()
  try {
    const conditions: string[] = []
    const params: unknown[] = []
    if (values.client) {
      params.push(await clientIdForSlug(db, values.client))
      conditions.push(`client_id = $${params.length}`)
    }
    if (values.source) {
      params.push(values.source)
      conditions.push(`source = $${params.length}`)
    }
    const where = conditions.length ? `where ${conditions.join(' and ')}` : ''
    const r = await db.query(`update data.connector_schedule set renormalize_requested_at = now() ${where}`, params)
    console.log(`renormalize requested for ${r.rowCount} connector schedule row(s)`)
  } finally {
    await db.end()
  }
}

if (isMain(import.meta.url)) runMain(main)
