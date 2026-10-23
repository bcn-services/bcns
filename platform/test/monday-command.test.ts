// Monday: position of each item across the whole board pull, and the set_status_done write-back. No DB, mocked fetch.
import { describe, expect, it } from 'vitest'
import { connectors, SourceError, type Json, type Page, type RunContext } from '../worker/src/connectors/index.js'

const monday = connectors.monday
const cmd = monday.commands!.set_status_done

function ctxWith(config: Json, respond: (body: Json) => unknown) {
  const calls: { url: string; headers: Record<string, string>; body: Json }[] = []
  const fetch = (async (url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    calls.push({ url: String(url), headers: init.headers as Record<string, string>, body })
    return new Response(JSON.stringify(respond(body)))
  }) as unknown as typeof globalThis.fetch
  const ctx = ({ clientId: 'c1', source: 'monday', config, timezone: 'UTC', token: { secret: 'tok-123' }, fetch, log: () => {} }) as unknown as RunContext
  return { ctx, calls }
}
const ok = () => ({ data: { change_simple_column_value: { id: '555' } } })

describe('monday set_status_done', () => {
  it('sends change_simple_column_value on the configured board/column with the first done status, no label creation', async () => {
    const { ctx, calls } = ctxWith(monday.configSchema.parse({ board_id: 1001, columns: { status: 'color_mm72czhc' } }), ok)
    expect(await cmd(ctx, { item_id: '555' })).toEqual({ item_id: '555', status: 'Done' })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.monday.com/v2')
    expect(calls[0].headers.Authorization).toBe('tok-123')
    expect(calls[0].body.variables).toEqual({ board: '1001', item: '555', column: 'color_mm72czhc', value: 'Done' })
    expect(calls[0].body.query).toContain('change_simple_column_value(board_id: $board, item_id: $item, column_id: $column, value: $value)')
    expect(calls[0].body.query).not.toContain('create_labels_if_missing')
  })

  it('uses config.done_statuses[0] when set', async () => {
    const { ctx, calls } = ctxWith(monday.configSchema.parse({ board_id: '1', columns: { status: 'c' }, done_statuses: ['Complete', 'Done'] }), ok)
    await cmd(ctx, { item_id: '9' })
    expect(calls[0].body.variables.value).toBe('Complete')
  })

  it('throws (nothing sent) on a bad item id or a missing status column; throws the Monday reason on a GraphQL error', async () => {
    const good = monday.configSchema.parse({ board_id: '1', columns: { status: 'c' } })
    const a = ctxWith(good, ok)
    for (const item_id of [undefined, '', 'abc', '12 34', '1'.repeat(21)]) await expect(cmd(a.ctx, { item_id })).rejects.toThrow('item_id')
    expect(a.calls).toHaveLength(0)
    const b = ctxWith(monday.configSchema.parse({ board_id: '1' }), ok)
    await expect(cmd(b.ctx, { item_id: '5' })).rejects.toThrow('no status column')
    expect(b.calls).toHaveLength(0)
    const c = ctxWith(good, () => ({ errors: [{ message: 'Label Done does not exist' }] }))
    await expect(cmd(c.ctx, { item_id: '5' })).rejects.toThrow(/Label Done does not exist/)
    await expect(cmd(c.ctx, { item_id: '5' })).rejects.toBeInstanceOf(SourceError)
  })
})

describe('monday position', () => {
  it('is the 0-based index in items_page order across pages, and reaches the jobs row', async () => {
    const item = (id: string) => ({ id, name: `t${id}`, updated_at: '2026-10-01T00:00:00Z', group: { id: 'g', title: 'Daily' }, column_values: [] })
    const pages = [
      { cursor: 'next', items: [item('30'), item('10')] },
      { cursor: null, items: [item('20')] },
    ]
    let n = 0
    const { ctx } = ctxWith(monday.configSchema.parse({ board_id: '1' }), () => ({ data: { boards: [{ id: '1', name: 'b', columns: [], groups: [], items_page: pages[n++] }] } }))
    const got: Page[] = []
    for await (const p of monday.incremental(ctx, {})) got.push(p)
    const jobs = monday.normalize(ctx, got.flatMap(p => p.raw)).jobs!
    expect(jobs.map(j => [j.externalId, j.position])).toEqual([['30', 0], ['10', 1], ['20', 2]])
  })
})
