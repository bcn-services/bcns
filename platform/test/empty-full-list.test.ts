// §4.1 empty-listing guard: a complete run whose fullList listing held no ids fails instead of
// tombstoning every row. DB-free: sql/tx are mocked, so this runs without the local Supabase stack.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: string[] = []
const params: unknown[][] = []
vi.mock('../worker/src/db.js', () => ({
  sql: vi.fn(async (text: string, p: unknown[] = []) => {
    calls.push(text); params.push(p)
    if (text.includes('insert into data.connector_runs')) return { rows: [{ id: '1' }], rowCount: 1 }
    if (text.includes('from data.source_tokens')) {
      return { rows: [{ client_id: 'c1', source: 'monday', kind: 'monday_personal', secret: 'tok', refresh_secret: null, expires_at: null, attributes: {} }], rowCount: 1 }
    }
    if (text.includes('select timezone')) return { rows: [{ timezone: 'UTC' }], rowCount: 1 }
    return { rows: [], rowCount: 1 }
  }),
  tx: vi.fn(async (fn: (c: unknown) => Promise<unknown>) => fn({ query: async (text: string, p: unknown[] = []) => { calls.push(text); params.push(p); return { rows: [], rowCount: 0 } } })),
  storage: vi.fn(),
}))

const { emptyFullListTables, runOne } = await import('../worker/src/run.js')

const meta = [{ entity: 'campaign', table: 'records' }, { entity: 'ad', table: 'records' }]
const drive = [{ entity: 'file', table: 'media' }]

describe('emptyFullListTables', () => {
  it('reports a finished table whose listing held no ids', () => {
    expect(emptyFullListTables(drive, new Map([['media', new Set<string>()]]), new Set(['file']))).toEqual(['media'])
  })
  it('passes a finished table with ids', () => {
    expect(emptyFullListTables(drive, new Map([['media', new Set(['f1'])]]), new Set(['file']))).toEqual([])
  })
  it('ignores a table whose listing did not finish (budget stop)', () => {
    expect(emptyFullListTables(drive, new Map([['media', new Set<string>()]]), new Set())).toEqual([])
  })
  it('judges a two-entity table on the union of its ids', () => {
    expect(emptyFullListTables(meta, new Map([['records', new Set<string>()]]), new Set(['campaign', 'ad']))).toEqual(['records'])
    expect(emptyFullListTables(meta, new Map([['records', new Set(['c1'])]]), new Set(['campaign', 'ad']))).toEqual([])
    expect(emptyFullListTables(meta, new Map([['records', new Set<string>()]]), new Set(['campaign']))).toEqual([])
  })
  it('is empty for a source with no fullList', () => {
    expect(emptyFullListTables(undefined, new Map(), new Set())).toEqual([])
  })
})

const board = (items: unknown[]) => ({
  data: { boards: [{ id: '1001', name: 'Board 1', columns: [], groups: [], items_page: { cursor: null, items } }] },
})
const item = { id: '1', name: 'Item 1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', group: { id: 'g', title: 'G' }, column_values: [] }
const row = {
  client_id: 'c1', source: 'monday', interval: '1 hour', backfill_from: new Date(), backfill_cursor: null,
  incremental_cursor: {}, config: { board_id: '1001' }, lease_owner: 'o',
} as never
const tick = (body: unknown) => ({
  owner: 'o', stubbed: true, log: () => {}, budgetMs: 60_000, claimLimit: 1, taskIndex: 0, taskCount: 1, now: () => new Date(),
  fetch: (async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch,
}) as never

describe('runOne with a complete but empty listing', () => {
  beforeEach(() => { calls.length = 0; params.length = 0 })

  it('fails the run and tombstones nothing', async () => {
    await runOne(tick(board([])), row)
    expect(calls.some(c => /update data\.jobs set deleted_at = now\(\)/.test(c))).toBe(false)
    expect(calls.some(c => /set status = 'ok'/.test(c))).toBe(false)
    const i = calls.findIndex(c => /update data\.connector_runs set status = \$2/.test(c))
    expect(params[i]).toEqual([1, 'error', expect.stringMatching(/^found nothing to sync: the board is empty or not shared/)])
  })

  it('still tombstones and succeeds when the listing has ids', async () => {
    await runOne(tick(board([item])), row)
    expect(calls.some(c => /update data\.jobs set deleted_at = now\(\)/.test(c))).toBe(true)
    expect(calls.some(c => /set status = 'ok'/.test(c))).toBe(true)
  })
})
