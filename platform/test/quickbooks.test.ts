// §4.7 QuickBooks connector — pure unit tests, NO database. normalize/amountCents/
// refreshToken/baseUrl/buildQuery are all plain functions or take a stubbed ctx,
// so none of this needs a client, a schema, or writeRaw.
// index.js is imported first (not quickbooks.js) so the shopify/meta/monday/meet/drive/quickbooks
// circular import resolves connectors.quickbooks before this file's own top-level code runs —
// importing quickbooks.js first here left `quickbooks` undefined inside index.ts's own registry.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { classify, SourceError, type Json, type RawRow, type RunContext } from '../worker/src/connectors/index.js'
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

const purchaseCredit: RawRow = {
  entity: 'Purchase',
  externalId: '404',
  payload: {
    Id: '404',
    TxnDate: '2026-09-04',
    TotalAmt: '25.00',
    Credit: true,
    CurrencyRef: { value: 'USD' },
    EntityRef: { name: 'Staples' },
    MetaData: { LastUpdatedTime: '2026-09-04T10:00:00-07:00' },
  },
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

  it('negates amount_cents for a Purchase.Credit (vendor refund, money IN) even though TotalAmt is positive', () => {
    const { records = [] } = quickbooks.normalize({} as RunContext, [purchaseCredit])
    expect(records).toHaveLength(1)
    expect(records[0].attributes.amount_cents).toBe(-2500)
    expect(records[0].attributes.credit).toBe(true)
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

  it('throws when unset — no silent default, sandbox or otherwise', () => {
    delete process.env.QUICKBOOKS_ENV
    expect(() => baseUrl()).toThrow(/QUICKBOOKS_ENV must be 'sandbox' or 'production'/)
  })

  it('switches to production when QUICKBOOKS_ENV=production', () => {
    process.env.QUICKBOOKS_ENV = 'production'
    expect(baseUrl()).toBe('https://quickbooks.api.intuit.com')
  })

  it('resolves sandbox when QUICKBOOKS_ENV=sandbox', () => {
    process.env.QUICKBOOKS_ENV = 'sandbox'
    expect(baseUrl()).toBe('https://sandbox-quickbooks.api.intuit.com')
  })

  it('throws rather than failing safe on a typo', () => {
    process.env.QUICKBOOKS_ENV = 'prod'
    expect(() => baseUrl()).toThrow(/QUICKBOOKS_ENV must be 'sandbox' or 'production'/)
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

  it('throws when Intuit omits access_token', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({
      refresh_token: 'new-refresh', expires_in: 3600, // no access_token
    }), { status: 200 })) as unknown as typeof fetch
    await expect(quickbooks.refreshToken!(ctx(fetchImpl))).rejects.toThrow(/access_token/)
  })

  it('throws on a non-positive or non-finite expires_in rather than letting `new Date` misbehave', async () => {
    const bad = (expires_in: unknown) => (async () => new Response(JSON.stringify({
      access_token: 'new-access', refresh_token: 'new-refresh', expires_in,
    }), { status: 200 })) as unknown as typeof fetch
    await expect(quickbooks.refreshToken!(ctx(bad(0)))).rejects.toThrow(/expires_in/)
    await expect(quickbooks.refreshToken!(ctx(bad(-1)))).rejects.toThrow(/expires_in/)
    await expect(quickbooks.refreshToken!(ctx(bad('nope')))).rejects.toThrow(/expires_in/)
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

describe('pull() generator (via incremental) — pagination, entity handoff, and the >= boundary', () => {
  // runQuery() calls baseUrl(), which now throws rather than defaulting when unset.
  const prevEnv = process.env.QUICKBOOKS_ENV
  beforeEach(() => { process.env.QUICKBOOKS_ENV = 'sandbox' })
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.QUICKBOOKS_ENV
    else process.env.QUICKBOOKS_ENV = prevEnv
  })

  const ctx = (fetchImpl: typeof fetch): RunContext => ({
    clientId: 'c1', source: 'quickbooks', config: { realm_id: '123' }, timezone: 'America/New_York',
    token: { client_id: 'c1', source: 'quickbooks', kind: 'quickbooks_oauth_refresh', secret: 'tok', refresh_secret: 'r', expires_at: null, attributes: {} },
    fetch: fetchImpl, log: () => {}, putObject: async () => {}, hasMetricToday: async () => false,
    knownMedia: async () => new Set(), mergeConfig: async () => {},
  }) as unknown as RunContext

  it('yields a full Purchase page then a partial one, only starts Bill after Purchase is entityDone, and finishes done on Bill’s partial page — query carries an inclusive >= boundary', async () => {
    const mkRows = (n: number, startId: number): Json[] =>
      Array.from({ length: n }, (_, i) => ({ Id: String(startId + i), MetaData: { LastUpdatedTime: '2026-09-05T00:00:00.000Z' } }))

    const queries: string[] = []
    const fetchImpl = (async (url: string | URL) => {
      const query = new URL(String(url)).searchParams.get('query') ?? ''
      queries.push(query)
      const body = query.startsWith('select * from Purchase')
        ? { QueryResponse: { Purchase: query.includes('startposition 1 ') ? mkRows(1000, 1) : mkRows(3, 1001) } }
        : { QueryResponse: { Bill: mkRows(2, 1) } }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch

    const cursors = { Purchase: { last_updated: '2026-09-01T00:00:00.000Z' } }
    const pages = []
    for await (const page of quickbooks.incremental(ctx(fetchImpl), cursors)) pages.push(page)

    expect(pages.map(p => [p.entity, p.raw.length, p.entityDone, p.done])).toEqual([
      ['Purchase', 1000, false, false],
      ['Purchase', 3, true, false],
      ['Bill', 2, true, true],
    ])
    expect(pages[0].cursor).toEqual({ entity: 'Purchase', start: 1001 })
    // Incremental entityDone always carries this entity's own watermark (not a handoff to Bill) —
    // otherwise run.ts's per-entity incremental_cursor map loses Purchase's cursor entirely, and
    // the next tick re-queries all Purchases from 1970-01-01 (the bug this test now guards against).
    expect(pages[1].cursor).toEqual({ last_updated: '2026-09-05T00:00:00.000Z' })
    expect(pages[2].cursor).toMatchObject({ last_updated: expect.any(String) })

    expect(queries.length).toBe(3)
    expect(queries[2].startsWith('select * from Bill')).toBe(true)

    // Inclusive boundary: mutating `>=` back to `>` drops this exact substring and reddens the test.
    expect(queries[0]).toContain("MetaData.LastUpdatedTime >= '2026-09-01T00:00:00.000Z'")
    expect(queries[1]).toContain("MetaData.LastUpdatedTime >= '2026-09-01T00:00:00.000Z'")
    expect(queries[2]).toContain("MetaData.LastUpdatedTime >= '1970-01-01T00:00:00.000Z'")
  })

  it('reads each entity\'s own prior cursor from the per-entity incremental map, and every entityDone yields only { last_updated } — no entity/start handoff keys', async () => {
    const queries: string[] = []
    const fetchImpl = (async (url: string | URL) => {
      const query = new URL(String(url)).searchParams.get('query') ?? ''
      queries.push(query)
      const isPurchase = query.startsWith('select * from Purchase')
      const body = isPurchase
        ? { QueryResponse: { Purchase: [{ Id: '1', MetaData: { LastUpdatedTime: '2026-09-10T00:00:00.000Z' } }] } }
        : { QueryResponse: { Bill: [{ Id: '1', MetaData: { LastUpdatedTime: '2026-08-20T00:00:00.000Z' } }] } }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch

    const cursors = {
      Purchase: { last_updated: '2026-09-01T00:00:00.000Z' },
      Bill: { last_updated: '2026-08-15T00:00:00.000Z' },
    }
    const pages = []
    for await (const page of quickbooks.incremental(ctx(fetchImpl), cursors)) pages.push(page)

    expect(queries[0]).toContain("MetaData.LastUpdatedTime >= '2026-09-01T00:00:00.000Z'")
    expect(queries[1]).toContain("MetaData.LastUpdatedTime >= '2026-08-15T00:00:00.000Z'")

    for (const page of pages) {
      expect(page.cursor).toEqual({ last_updated: expect.any(String) })
      expect(page.cursor).not.toHaveProperty('entity')
      expect(page.cursor).not.toHaveProperty('start')
    }
  })
})

describe('pull() generator (via backfill) — entity handoff still uses { entity, start } (backfill_cursor is one shared value, not per-entity)', () => {
  const prevEnv = process.env.QUICKBOOKS_ENV
  beforeEach(() => { process.env.QUICKBOOKS_ENV = 'sandbox' })
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.QUICKBOOKS_ENV
    else process.env.QUICKBOOKS_ENV = prevEnv
  })

  const ctx = (fetchImpl: typeof fetch): RunContext => ({
    clientId: 'c1', source: 'quickbooks', config: { realm_id: '123' }, timezone: 'America/New_York',
    token: { client_id: 'c1', source: 'quickbooks', kind: 'quickbooks_oauth_refresh', secret: 'tok', refresh_secret: 'r', expires_at: null, attributes: {} },
    fetch: fetchImpl, log: () => {}, putObject: async () => {}, hasMetricToday: async () => false,
    knownMedia: async () => new Set(), mergeConfig: async () => {},
  }) as unknown as RunContext

  it('a full first-entity page still hands off { entity: "Bill", start: 1 } on Purchase entityDone, and the final page carries { last_updated }', async () => {
    const mkRows = (n: number, startId: number): Json[] =>
      Array.from({ length: n }, (_, i) => ({ Id: String(startId + i), MetaData: { LastUpdatedTime: '2026-09-05T00:00:00.000Z' } }))

    const fetchImpl = (async (url: string | URL) => {
      const query = new URL(String(url)).searchParams.get('query') ?? ''
      const body = query.startsWith('select * from Purchase')
        ? { QueryResponse: { Purchase: query.includes('startposition 1 ') ? mkRows(1000, 1) : mkRows(3, 1001) } }
        : { QueryResponse: { Bill: mkRows(2, 1) } }
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as unknown as typeof fetch

    const pages = []
    for await (const page of quickbooks.backfill(ctx(fetchImpl), new Date('2026-01-01'), null)) pages.push(page)

    expect(pages.map(p => [p.entity, p.raw.length, p.entityDone, p.done])).toEqual([
      ['Purchase', 1000, false, false],
      ['Purchase', 3, true, false],
      ['Bill', 2, true, true],
    ])
    expect(pages[0].cursor).toEqual({ entity: 'Purchase', start: 1001 })
    expect(pages[1].cursor).toEqual({ entity: 'Bill', start: 1 })
    expect(pages[2].cursor).toMatchObject({ last_updated: expect.any(String) })
  })
})
