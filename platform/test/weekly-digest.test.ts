// Weekly digest: pure decision + copy layer (no DB, runs locally). DB-backed cases live in worker.test.ts.
import { describe, expect, it } from 'vitest'
import { digestEmail, lastWeek, ownerRecipients, weeklyDigest, type DigestRow } from '../worker/src/health.js'

const none: DigestRow = {
  revenue_minor: 0, orders: 0, refunds_minor: 0, payouts_minor: 0, currency: null, sessions: null,
  ad_spend_minor: null, ad_purchase_value_minor: null, ad_currency: null,
}
const row = (o: Partial<DigestRow> = {}): DigestRow => ({ ...none, currency: 'USD', ...o })
const W = { start: '2026-09-28', end: '2026-10-04', week: '2026-W40' }
const NY = 'America/New_York'
const wk = (iso: string, tz = NY) => lastWeek(new Date(iso), tz)

describe('lastWeek', () => {
  it('Monday 08:59 local is still the old week; 09:01 rolls over (literal labels)', () => {
    expect(wk('2026-10-05T12:59:00Z')).toEqual({ start: '2026-09-21', end: '2026-09-27', week: '2026-W39' })
    expect(wk('2026-10-05T13:01:00Z')).toEqual({ start: '2026-09-28', end: '2026-10-04', week: '2026-W40' })
  })
  it('stays the same through the whole following week, Sunday night included', () => {
    expect(wk('2026-10-11T03:00:00Z').week).toBe('2026-W40')   // Sat 23:00 local
    expect(wk('2026-10-12T12:59:00Z').week).toBe('2026-W40')   // next Monday 08:59 local
  })
  it('the same instant lands in different weeks in different zones', () => {
    expect(wk('2026-10-05T13:01:00Z', 'America/Los_Angeles').week).toBe('2026-W39')   // Mon 06:01
    expect(wk('2026-10-05T13:01:00Z', 'Asia/Tokyo').week).toBe('2026-W40')           // Mon 22:01
  })
  it('ISO year boundary: 53-week 2026', () => {
    expect(wk('2027-01-04T15:00:00Z')).toEqual({ start: '2026-12-28', end: '2027-01-03', week: '2026-W53' })
  })
})

describe('weeklyDigest', () => {
  it('no data -> null: zero rows, and rows carrying only inventory / conversion', () => {
    expect(weeklyDigest('c1', [], W)).toBeNull()
    expect(weeklyDigest('c1', [none, none, none], W)).toBeNull()
  })
  it('any one of money, sessions, ad spend is data', () => {
    expect(weeklyDigest('c1', [row()], W)).not.toBeNull()
    expect(weeklyDigest('c1', [{ ...none, sessions: 0 }], W)).not.toBeNull()
    expect(weeklyDigest('c1', [{ ...none, ad_spend_minor: 500, ad_currency: 'USD' }], W)).not.toBeNull()
  })
  it('key is literal, identical for two nows in one week, different the next week', () => {
    const key = (iso: string) => { const w = wk(iso); return weeklyDigest('c1', [row()], w)!.dedupe_key }
    expect(key('2026-10-05T13:01:00Z')).toBe('weekly_digest:c1:2026-W40')
    expect(key('2026-10-05T13:01:00Z')).toBe(key('2026-10-09T20:30:00Z'))
    expect(key('2026-10-12T13:01:00Z')).toBe('weekly_digest:c1:2026-W41')
    expect(key('2026-10-12T13:01:00Z')).not.toBe(key('2026-10-05T13:01:00Z'))
  })
  it('sums the week; AOV and ROAS are totals over totals, not averages of daily values', () => {
    const n = weeklyDigest('c1', [
      row({ orders: '2', revenue_minor: '3000', refunds_minor: -500, payouts_minor: 0, ad_spend_minor: 1000, ad_purchase_value_minor: 2500, ad_currency: 'USD' }),
      row({ orders: 1, revenue_minor: 1500, ad_spend_minor: 3000, ad_purchase_value_minor: 3500, ad_currency: 'USD', sessions: 40 }),
      row({ orders: 0, revenue_minor: 0, sessions: 10 }),
    ], W)!
    expect(n.kind).toBe('weekly_digest')
    expect(n.payload.money).toEqual([{ currency: 'USD', orders: 3, revenue_minor: 4500, refunds_minor: -500, payouts_minor: 0, aov_minor: 1500 }])
    expect(n.payload.sessions).toBe(50)
    expect(n.payload.ads).toEqual([{ currency: 'USD', spend_minor: 4000, purchase_value_minor: 6000, roas: 1.5 }])
    expect(n.payload).toMatchObject({ week: '2026-W40', start: '2026-09-28', end: '2026-10-04' })
  })
  it('zero orders: no AOV; zero ad spend: no ROAS', () => {
    const n = weeklyDigest('c1', [row({ ad_spend_minor: 0, ad_purchase_value_minor: 0, ad_currency: 'USD' })], W)!
    expect(n.payload.money[0].aov_minor).toBeNull()
    expect(n.payload.ads[0].roas).toBeNull()
  })
  it('several currencies stay separate', () => {
    const n = weeklyDigest('c1', [row({ orders: 1, revenue_minor: 1000 }), row({ currency: 'EUR', orders: 2, revenue_minor: 4000 })], W)!
    expect(n.payload.money.map(m => [m.currency, m.orders, m.revenue_minor])).toEqual([['USD', 1, 1000], ['EUR', 2, 4000]])
  })
  it('carries no tenant names', () => {
    expect(JSON.stringify(weeklyDigest('c1', [row()], W))).not.toMatch(/name|email/i)
  })
})

describe('digestEmail', () => {
  const full = () => weeklyDigest('c1', [row({ orders: 4, revenue_minor: 1234567, refunds_minor: -2500, payouts_minor: 90000, sessions: 1200, ad_spend_minor: 20000, ad_purchase_value_minor: 64000, ad_currency: 'USD' })], W)!.payload
  it('formats USD cents, shows every reported line, links the hub', () => {
    const m = digestEmail(full())
    expect(m.subject).toBe('Your week in numbers: September 28 to October 4')
    expect(m.text).toContain('Orders: 4')
    expect(m.text).toContain('Sales: $12,345.67')
    expect(m.text).toContain('Average order: $3,086.42')
    expect(m.text).toContain('Refunded: $25.00')
    expect(m.text).toContain('Paid out to your bank: $900.00')
    expect(m.text).toContain('Visits to your site: 1,200')
    expect(m.text).toContain('Ad spend: $200.00')
    expect(m.text).toContain('Ad sales for every 1 USD spent: 3.20')
    expect(m.text).toContain('https://connect.bcn-services.com/')
  })
  it('a zero-decimal currency is not divided by 100', () => {
    const m = digestEmail(weeklyDigest('c1', [row({ currency: 'JPY', orders: 2, revenue_minor: 5000 })], W)!.payload)
    expect(m.text).toContain('Sales: ¥5,000')
    expect(m.text).toContain('Average order: ¥2,500')
  })
  it('several currencies are labelled per line', () => {
    const m = digestEmail(weeklyDigest('c1', [row({ orders: 1, revenue_minor: 1000 }), row({ currency: 'EUR', orders: 2, revenue_minor: 4000 })], W)!.payload)
    expect(m.text).toContain('Sales (USD): $10.00')
    expect(m.text).toContain('Sales (EUR): €40.00')
  })
  it('omits lines whose source did not report', () => {
    const t = digestEmail(weeklyDigest('c1', [row({ orders: 1, revenue_minor: 1000 })], W)!.payload).text
    expect(t).not.toMatch(/Visits|Ad |Refunded|Paid out/)
    const s = digestEmail(weeklyDigest('c1', [{ ...none, sessions: 7 }], W)!.payload).text
    expect(s).toContain('Visits to your site: 7')
    expect(s).not.toMatch(/Orders|Sales|Ad /)
  })
  it('plain copy: no jargon, no reply / unsubscribe / opt-out promise', () => {
    const { subject, text } = digestEmail(full())
    expect(`${subject}\n${text}`).not.toMatch(/\b(MCP|OAuth|API|sync|cursor|token|webhook|ROAS|AOV|KPI|metric)\b/i)
    expect(`${subject}\n${text}`).not.toMatch(/reply|unsubscribe|opt.?out|turn (this|it) off|stop receiving|soon|coming/i)
  })
})

describe('digest audience', () => {
  it('owners only: members and smoke accounts excluded, deduped', () => {
    expect(ownerRecipients([
      { email: 'o@example.com', role: 'owner', is_smoke: false }, { email: 'o@example.com', role: 'owner', is_smoke: false },
      { email: 'm@example.com', role: 'member', is_smoke: false }, { email: 's@example.com', role: 'owner', is_smoke: true },
    ])).toEqual(['o@example.com'])
  })
})
