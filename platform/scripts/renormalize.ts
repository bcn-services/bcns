// renormalize [--client <slug>] [--source <s>] [--apply]  (DESIGN.md §5.8, §5.10)
// Dry-run by default: lists the matching connector_schedule rows with their raw_latest row counts and
// writes nothing. With --apply, sets connector_schedule.renormalize_requested_at = now() on them (all
// rows when --client is omitted); the worker (worker/src/renormalize.ts) then replays raw_latest.
// NOTES: §5.8's `--since <date>` isn't implemented — renormalize_cursor is a keyset position
// (entity, external_id), not a date, which worker/src/renormalize.ts resumes from.
import { parseArgs } from 'node:util'
import { pgClient, clientIdForSlug, isMain, runMain } from './_lib.js'

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({ args: argv, options: { client: { type: 'string' }, source: { type: 'string' }, apply: { type: 'boolean' } } })

  const db = pgClient()
  try {
    const conditions: string[] = []
    const params: unknown[] = []
    if (values.client) {
      params.push(await clientIdForSlug(db, values.client))
      conditions.push(`s.client_id = $${params.length}`)
    }
    if (values.source) {
      params.push(values.source)
      conditions.push(`s.source = $${params.length}`)
    }
    const where = conditions.length ? `where ${conditions.join(' and ')}` : ''
    if (!values.apply) {
      const rows = await db.query<{ slug: string; source: string; raw: string }>(
        `select c.slug, s.source, (select count(*) from data.raw_latest r where r.client_id = s.client_id and r.source = s.source)::text as raw
           from data.connector_schedule s join data.clients c on c.id = s.client_id ${where}
          order by c.slug, s.source`, params)
      for (const r of rows.rows) console.log(`${r.slug}\t${r.source}\t${r.raw} raw_latest row(s)`)
      console.log(`dry run: ${rows.rowCount} connector schedule row(s) match, nothing written; pass --apply to request renormalize`)
      return
    }
    const r = await db.query(`update data.connector_schedule s set renormalize_requested_at = now() ${where}`, params)
    console.log(`renormalize requested for ${r.rowCount} connector schedule row(s)`)
  } finally {
    await db.end()
  }
}

if (isMain(import.meta.url)) runMain(main)
