// §4.4 Monday.com — one board, items + status. Personal token, no expiry.
import { z } from 'zod'
import {
  type CanonicalWrites, type Connector, type Json, type JobRow, type Page, type RawRow, type RunContext,
  SourceError,
} from './index.js'

const API = 'https://api.monday.com/v2'
const PAGE = 500

const configSchema = z.object({
  board_id: z.union([z.string(), z.number()]).transform(String),
  board_url: z.string().optional(),
  columns: z.record(z.string()).default({}),
  done_statuses: z.array(z.string()).default(['Done']),
}).passthrough()

const QUERY = `query ($board: [ID!], $cursor: String) {
  boards(ids: $board) { id name
    columns { id title type }
    groups { id title }
    items_page(limit: ${PAGE}, cursor: $cursor) { cursor
      items { id name created_at updated_at group { id title }
              column_values { id type text value } } } } }`

async function gql(ctx: RunContext, variables: Json): Promise<Json> {
  const r = await ctx.fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: ctx.token.secret, 'API-Version': '2025-01' },
    body: JSON.stringify({ query: QUERY, variables }),
  })
  const body = await r.json().catch(() => ({}))
  if (body?.errors?.length) throw new SourceError('monday', String(body.errors[0]?.message ?? 'graphql error'), r.status, body)
  if (!r.ok) throw new SourceError('monday', `HTTP ${r.status}`, r.status, body)
  return body.data
}

/** Backfill depth is 0 (current state only), so both modes are the same full-board pull. */
async function* pull(ctx: RunContext): AsyncGenerator<Page> {
  let cursor: string | null = null
  let first = true
  for (;;) {
    const d: Json = await gql(ctx, { board: [ctx.config.board_id], cursor })
    const b = d.boards?.[0]
    if (!b) throw new SourceError('monday', `board ${ctx.config.board_id} not found`, 200, d)
    const raw: RawRow[] = []
    if (first) raw.push({ entity: 'board', externalId: String(b.id), payload: { id: b.id, name: b.name, columns: b.columns, groups: b.groups } })
    for (const it of b.items_page?.items ?? []) {
      raw.push({ entity: 'item', externalId: String(it.id), sourceUpdatedAt: it.updated_at ? new Date(it.updated_at) : undefined, payload: it })
    }
    cursor = b.items_page?.cursor ?? null
    const done = !cursor
    yield { raw, entity: 'item', cursor: done ? { pulled_at: new Date().toISOString() } : { cursor }, entityDone: done, done }
    first = false
    if (done) return
  }
}

const cv = (it: Json, id: string | undefined) =>
  id ? (it.column_values ?? []).find((c: Json) => c.id === id) : undefined
const txt = (it: Json, id: string | undefined) => cv(it, id)?.text || null

export const monday: Connector = {
  source: 'monday',
  defaults: {
    interval: '1 hour',
    backfillDepth: '0',
    rateLimit: { concurrency: 1, minDelayMs: 500 },
    fullList: [{ entity: 'item', table: 'jobs' }],
  },
  configSchema,
  tokenKind: 'monday_personal',

  backfill(ctx) { return pull(ctx) },
  incremental(ctx) { return pull(ctx) },

  normalize(ctx: RunContext, rows: RawRow[]): CanonicalWrites {
    const cols = ctx.config.columns ?? {}
    const done: string[] = ctx.config.done_statuses ?? ['Done']
    const boardUrl = ctx.config.board_url ?? ''
    const jobs: JobRow[] = []
    for (const r of rows) {
      if (r.entity !== 'item') continue
      const it = r.payload
      const status = txt(it, cols.status)
      const due = txt(it, cols.due)
      jobs.push({
        externalId: String(it.id), kind: 'task', title: it.name ?? '',
        status, is_done: status != null && done.includes(status),
        priority: txt(it, cols.priority), group_name: it.group?.title ?? null, owner: txt(it, cols.owner),
        due_on: due && /^\d{4}-\d{2}-\d{2}/.test(due) ? due.slice(0, 10) : null,
        url: txt(it, cols.link) || (boardUrl ? `${boardUrl}/pulses/${it.id}` : null),
        attributes: {
          group_id: it.group?.id ?? null,
          column_values: Object.fromEntries((it.column_values ?? []).map((c: Json) => [c.id, { text: c.text ?? null, value: c.value ?? null }])),
        },
        source_updated_at: it.updated_at ?? null,
      })
    }
    return { jobs }
  },
}
