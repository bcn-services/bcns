// finishError must redact once, before the log line and connector_runs.error, not only the
// status columns. DB-free: sql is mocked, so this runs without the local Supabase stack.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls: { text: string; params: unknown[] }[] = []
vi.mock('../worker/src/db.js', () => ({
  sql: vi.fn(async (text: string, params: unknown[] = []) => { calls.push({ text, params }); return { rows: [] } }),
  tx: vi.fn(), storage: vi.fn(),
}))

const { finishError } = await import('../worker/src/run.js')
const { SourceError } = await import('../worker/src/connectors/index.js')

const row = { client_id: 'c1', source: 'shopify', lease_owner: 'o' } as never

describe('finishError redaction', () => {
  beforeEach(() => { calls.length = 0 })

  for (const secret of ['access_token=abc', 'Bearer xyz']) {
    it(`redacts "${secret}" from the log and connector_runs.error`, async () => {
      const logs: Record<string, unknown>[] = []
      const t = { owner: 'o', log: (_: string, d?: Record<string, unknown>) => { if (d) logs.push(d) } } as never
      await finishError(t, row, 7, new SourceError('shopify', `HTTP 500: upstream echoed ${secret}`, 500, {}))

      const runUpdate = calls.find(c => c.text.includes('update data.connector_runs'))!
      expect(String(runUpdate.params[2])).not.toMatch(/abc|xyz/)
      expect(String(runUpdate.params[2])).toMatch(/\*\*\*/)
      expect(String(logs[0]!.error)).not.toMatch(/abc|xyz/)
      expect(String(logs[0]!.error)).toMatch(/\*\*\*/)
      for (const c of calls) expect(JSON.stringify(c.params)).not.toMatch(/abc|xyz/)
    })
  }
})
