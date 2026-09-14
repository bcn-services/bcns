// add-source --slug <slug> --source shopify|meta|monday|meet|drive [--reset-cursors]  (DESIGN.md §5.10, §9)
// Attaches one source to an existing client exactly as onboard does: same prompts, same §9 checklist
// (a failed item stops before anything is written), same source_tokens + connector_schedule upserts.
// Safe to re-run: rotates the token and resets its status; the schedule keeps its cursors. Refuses while
// a run holds the lease (a 401 from the old token would mark the new one auth_failed), and refuses a
// changed board/shop/account/folder unless --reset-cursors, since the saved cursors point into the old one.
import { parseArgs } from 'node:util'
import { createInterface } from 'node:readline/promises'
import { connectors, type Source } from '../worker/src/connectors/index.js'
import { attachSource } from './onboard.js'
import { die, pgClient, isMain, runMain } from './_lib.js'

const USAGE = 'usage: add-source --slug <slug> --source shopify|meta|monday|meet|drive [--reset-cursors]'
// The config field naming the vendor object the cursors point into.
const TARGET: Record<Source, string> = { shopify: 'shop', meta: 'act_id', monday: 'board_id', meet: 'folder_id', drive: 'folder_id' }

export async function main(argv: string[], ask?: (q: string) => Promise<string>): Promise<void> {
  const { values } = parseArgs({ args: argv, options: {
    slug: { type: 'string' }, source: { type: 'string' }, 'reset-cursors': { type: 'boolean' } } })
  const { slug, source } = values
  const reset = values['reset-cursors'] ?? false
  if (!slug || !source) die(USAGE)
  if (!Object.hasOwn(connectors, source)) die(`unknown source: ${source} (${USAGE})`)

  const db = pgClient()
  const rl = ask ? null : createInterface({ input: process.stdin, output: process.stdout })
  const question = ask ?? ((q: string) => rl!.question(q))
  try {
    const r = await db.query<{ id: string; timezone: string; status: string }>(
      'select id, timezone, status from data.clients where slug = $1', [slug])
    if (!r.rowCount) die(`no client with slug ${slug}`)
    const { id, timezone, status } = r.rows[0]
    if (status === 'churned') die(`client ${slug} is churned`)
    const prev = (await db.query<{ config: Record<string, unknown>; busy: boolean }>(
      'select config, lease_until > now() as busy from data.connector_schedule where client_id = $1 and source = $2', [id, source])).rows[0]
    if (prev?.busy) die(`a ${source} run for ${slug} is in flight; retry in a few minutes`)
    const key = TARGET[source as Source]
    const checked = async (q: string) => {
      const a = await question(q)
      if (q === `${source} ${key}: ` && prev?.config[key] !== undefined && prev.config[key] !== a && !reset)
        die(`${key} changed (${prev.config[key]} -> ${a}); the saved cursors belong to the old one. Re-run with --reset-cursors`)
      return a
    }
    await attachSource(db, id, timezone, source as Source, checked)
    if (reset) await db.query(`update data.connector_schedule set backfill_cursor = '{}', incremental_cursor = '{}', next_run_at = now()
      where client_id = $1 and source = $2`, [id, source])
    const s = (await db.query<{ next_run_at: Date; enabled: boolean }>(
      'select next_run_at, enabled from data.connector_schedule where client_id = $1 and source = $2', [id, source])).rows[0]
    const when = !s.enabled ? 'schedule disabled' : status !== 'active' ? `client ${status}` : `next pull ${s.next_run_at.toISOString()}`
    console.log(`attached ${source} to ${slug} (${id}); ${when}`)
  } finally {
    rl?.close()
    await db.end()
  }
}

if (isMain(import.meta.url)) runMain(main)
