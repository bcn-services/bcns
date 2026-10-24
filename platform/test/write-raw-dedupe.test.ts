// writeRaw dedupes a page by (entity, externalId) with a NUL separator in the Map key: a space
// would make ("a b","c") and ("a","b c") collide. DB-free: the client just records the query params.
import { describe, expect, it, vi } from 'vitest'

vi.mock('../worker/src/db.js', () => ({ sql: vi.fn(), tx: vi.fn(), storage: vi.fn() }))

const { writeRaw } = await import('../worker/src/run.js')

const raw = (entity: string, externalId: string, payload: number) => ({ entity, externalId, payload: { payload } })

async function sent(rows: ReturnType<typeof raw>[]) {
  let params: unknown[] = []
  const c = { query: async (_: string, p: unknown[]) => { params = p; return { rowCount: 0 } } }
  await writeRaw(c as never, 'c1', 'shopify', rows, null)
  return { entities: params[2] as string[], ids: params[3] as string[], payloads: params[5] as string[] }
}

describe('writeRaw page dedupe key', () => {
  it('keeps the last write for a repeated (entity, externalId)', async () => {
    const r = await sent([raw('order', '1', 1), raw('order', '1', 2)])
    expect(r.ids).toEqual(['1'])
    expect(r.payloads).toEqual(['{"payload":2}'])
  })

  it('does not merge keys that differ only where a space/NUL separator would matter', async () => {
    const r = await sent([raw('a b', 'c', 1), raw('a', 'b c', 2)])
    expect(r.entities).toEqual(['a b', 'a'])
    expect(r.ids).toEqual(['c', 'b c'])
  })
})
