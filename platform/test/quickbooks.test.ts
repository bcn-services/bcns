// §4.6 QuickBooks connector — pure unit tests, NO database. normalize/amountCents/
// refreshToken/baseUrl/buildQuery are all plain functions or take a stubbed ctx,
// so none of this needs a client, a schema, or writeRaw.
// index.js is imported first (not quickbooks.js) so the shopify/meta/monday/meet/drive/quickbooks
// circular import resolves connectors.quickbooks before this file's own top-level code runs —
// importing quickbooks.js first here left `quickbooks` undefined inside index.ts's own registry.
import { afterEach, describe, expect, it } from 'vitest'
import { classify, SourceError, type RawRow, type RunContext } from '../worker/src/connectors/index.js'
import { amountCents, baseUrl, buildQuery, quickbooks } from '../worker/src/connectors/quickbooks.js'

const purchase: RawRow = {
  entity: 'Purchase',
  externalId: '101',
  payload: {
    Id: '101',
    TxnDate: '2026-09-01',
    TotalAmt: '42.5',
    CurrencyRef: { value: 'USD' },
    EntityRef: { name: 'Staples' },
    PaymentType: 'CreditCard',
    PrivateNote: 'office supplies',
    MetaData: { LastUpdatedTime: '2026-09-01T10:00:00-07:00' },
    Line: [{ AccountBasedExpenseLineDetail: { AccountRef: { name: 'Office Expenses' } } }],
  },
}

const bill: RawRow = {
  entity: 'Bill',
  externalId: '202',
  payload: {
    Id: '202',
    TxnDate: '2026-09-02',
    TotalAmt: '1000.00',
    CurrencyRef: { value: 'USD' },
    VendorRef: { name: 'Acme Supply' },
    MetaData: { LastUpdatedTime: '2026-09-02T09:00:00-07:00' },
    Line: [
      { AccountBasedExpenseLineDetail: { AccountRef: { name: 'Rent' } } },
      { AccountBasedExpenseLineDetail: { AccountRef: { name: 'Utilities' } } },
    ],
  },
}

const billPayment: RawRow = {
  entity: 'BillPayment',
  externalId: '303',
  payload: { Id: '303', TxnDate: '2026-09-03', TotalAmt: '1000.00' },
}

describe('normalize', () => {
  it('maps a Purchase to a qbo_expense record', () => {
    const { records = [] } = quickbooks.normalize({} as RunContext, [purchase])
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      externalId: 'Purchase:101',
      kind: 'qbo_expense',
      occurred_at: new Date('2026-09-01').toISOString(),
      source_updated_at: '2026-09-01T10:00:00-07:00',
      attributes: {
        date: '2026-09-01',
        amount_cents: 4250,
        currency: 'USD',
        vendor: 'Staples',
        memo: 'office supplies',
        account: 'Office Expenses',
        accounts: ['Office Expenses'],
        txn_type: 'Purchase',
        payment_type: 'CreditCard',
      },
    })
  })

  it('maps a multi-line Bill, collecting all line accounts and vendor from VendorRef', () => {
    const { records = [] } = quickbooks.normalize({} as RunContext, [bill])
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      externalId: 'Bill:202',
      kind: 'qbo_expense',
      attributes: {
        amount_cents: 100000,
        vendor: 'Acme Supply',
        account: 'Rent',
        accounts: ['Rent', 'Utilities'],
        txn_type: 'Bill',
        payment_type: null,
      },
    })
  })

  it('drops BillPayment — money-out entities are Purchase and Bill only', () => {
    const { records = [] } = quickbooks.normalize({} as RunContext, [purchase, billPayment, bill])
    expect(records.map(r => r.externalId)).toEqual(['Purchase:101', 'Bill:202'])
  })

  it('is idempotent: normalizing the same rows twice yields identical output', () => {
    const first = quickbooks.normalize({} as RunContext, [purchase, bill])
    const second = quickbooks.normalize({} as RunContext, [purchase, bill])
    expect(second).toEqual(first)
  })
})

describe('amountCents — decimal-string safe, no float multiply', () => {
  it('handles a plain decimal', () => expect(amountCents('42.5')).toBe(4250))
  it('handles a whole number with no fractional part', () => expect(amountCents('1000')).toBe(100000))
  it('handles a single decimal digit by zero-padding', () => expect(amountCents('9.1')).toBe(910))
  it('handles negatives', () => expect(amountCents('-12.34')).toBe(-1234))
  it('handles nullish as zero', () => expect(amountCents(undefined)).toBe(0))
  it('avoids the classic float-multiply rounding failure (0.1 + 0.2 style)', () => {
    // Number('19.99') * 100 is 1998.9999999999998 pre-Math.round; this must be exact.
    expect(amountCents('19.99')).toBe(1999)
  })
})

describe('baseUrl', () => {
  const prev = process.env.QUICKBOOKS_ENV
  afterEach(() => {
    if (prev === undefined) delete process.env.QUICKBOOKS_ENV
    else process.env.QUICKBOOKS_ENV = prev
  })

  it('defaults to sandbox when unset', () => {
    delete process.env.QUICKBOOKS_ENV
    expect(baseUrl()).toBe('https://sandbox-quickbooks.api.intuit.com')
  })

  it('switches to production when QUICKBOOKS_ENV=production', () => {
    process.env.QUICKBOOKS_ENV = 'production'
    expect(baseUrl()).toBe('https://quickbooks.api.intuit.com')
  })

  it('anything else (e.g. a typo) fails safe to sandbox', () => {
    process.env.QUICKBOOKS_ENV = 'prod'
    expect(baseUrl()).toBe('https://sandbox-quickbooks.api.intuit.com')
  })
})

describe('buildQuery', () => {
  it('builds a paginated select with orderby Id for stable cursoring', () => {
    expect(buildQuery('Purchase', "TxnDate >= '2026-01-01'", 1))
      .toBe("select * from Purchase where TxnDate >= '2026-01-01' orderby Id startposition 1 maxresults 1000")
  })

  it('advances startposition on the next page', () => {
    expect(buildQuery('Bill', "TxnDate >= '2026-01-01'", 1001))
      .toContain('startposition 1001')
  })
})

describe('refreshToken', () => {
  const ctx = (fetchImpl: typeof fetch): RunContext => ({
    clientId: 'c1', source: 'quickbooks', config: { realm_id: '123' }, timezone: 'America/New_York',
    token: { client_id: 'c1', source: 'quickbooks', kind: 'quickbooks_oauth_refresh', secret: 'old-access', refresh_secret: 'old-refresh', expires_at: null, attributes: {} },
    fetch: fetchImpl, log: () => {}, putObject: async () => {}, hasMetricToday: async () => false,
    knownMedia: async () => new Set(), mergeConfig: async () => {},
  }) as unknown as RunContext

  it('always returns the new refreshSecret Intuit issued', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({
      access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600,
    }), { status: 200 })) as unknown as typeof fetch
    const out = await quickbooks.refreshToken!(ctx(fetchImpl))
    expect(out.secret).toBe('new-access')
    expect(out.refreshSecret).toBe('new-refresh')
  })

  it('throws rather than silently keeping the spent refresh token when Intuit omits one', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({
      access_token: 'new-access', expires_in: 3600, // no refresh_token
    }), { status: 200 })) as unknown as typeof fetch
    await expect(quickbooks.refreshToken!(ctx(fetchImpl))).rejects.toThrow(/refresh_token/)
  })

  it('throws on invalid_grant (dead refresh token), classified as auth', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({
      error: 'invalid_grant', error_description: 'Token expired',
    }), { status: 400 })) as unknown as typeof fetch
    let caught: unknown
    try { await quickbooks.refreshToken!(ctx(fetchImpl)) } catch (e) { caught = e }
    expect(caught).toBeInstanceOf(SourceError)
    expect(classify(caught)).toBe('auth')
  })
})
