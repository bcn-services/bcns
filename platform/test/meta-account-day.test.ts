// Meta insights time_range is in the ad account's timezone and refreshes 7 days back (Ads Manager 7d_click parity).
import { afterEach, expect, it, vi } from 'vitest'
import { connectors, type RunContext } from '../worker/src/connectors/index.js' // index first: meta.ts imports it circularly

const meta = connectors.meta

afterEach(() => vi.useRealTimers())

async function ranges(account_timezone: string): Promise<{ since: string; until: string }[]> {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-07T23:30:00Z')) // 2026-11-08 12:30 in Auckland, 11-07 in UTC
  const urls: string[] = []
  const ctx = {
    clientId: 'c', source: 'meta', timezone: 'America/New_York', token: { secret: 't' },
    config: { act_id: 'act_1', currency: 'USD', account_timezone },
    mergeConfig: async () => {}, knownMedia: async () => new Set(),
    fetch: async (u: string) => { urls.push(u); return new Response(JSON.stringify({ data: [] })) },
  } as unknown as RunContext
  for await (const _ of meta.incremental(ctx, {})) void _
  return urls.filter(u => u.includes('/insights')).map(u => JSON.parse(new URL(u).searchParams.get('time_range')!))
}

it('uses account-local today and a 7-day refresh window', async () => {
  const r = await ranges('Pacific/Auckland')
  expect(r.length).toBeGreaterThan(0)
  for (const t of r) expect(t).toEqual({ since: '2026-11-01', until: '2026-11-08' })
})

it('falls back to the connection timezone for an invalid account timezone', async () => {
  const r = await ranges('Not/AZone')
  for (const t of r) expect(t.until).toBe('2026-11-07') // 18:30 New York
})
