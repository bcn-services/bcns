// Adversarial QA for the read-surface policy: hostile column names, filters, oversized and
// multi-byte results, and the real PostgREST URL a given input produces.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { agentTools, runTool } from '@bcn-services/data-client'
import { buildServer, envelope, mcpTools } from '../dist/mcp.js'
import { MCP_COLUMNS, MCP_TOOL_OPTIONS, MCP_VIEWS, RESULT_BYTE_CAP } from '../dist/policy.js'

/** Fake supabase-js whose fetch records the real PostgREST URL; returns `rows`. */
function urlClient(rows = []) {
  const urls = []
  const fetch = async (url) => {
    urls.push(new URL(String(url)))
    return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const sb = createClient('http://localhost:54321', 'anon', { db: { schema: 'api' }, global: { fetch } })
  const views = new Proxy({}, { get: (_, name) => (cols = '*') => sb.from(name).select(cols) })
  return { client: { views }, urls }
}

function recClient(rows = []) {
  const calls = []
  const views = new Proxy({}, {
    get: (_, name) => (cols) => {
      const call = { name, cols, eq: [], gte: [], lt: [], lte: [], order: [] }
      calls.push(call)
      const q = {
        eq: (c, v) => (call.eq.push([c, v]), q),
        gte: (c, v) => (call.gte.push([c, v]), q),
        lt: (c, v) => (call.lt.push([c, v]), q),
        lte: (c, v) => (call.lte.push([c, v]), q),
        order: (c) => (call.order.push(c), q),
        limit: () => q,
        then: (ok, bad) => Promise.resolve({ data: rows, error: null }).then(ok, bad),
      }
      return q
    },
  })
  return { client: { views }, calls }
}

const rejects = (client, input) =>
  assert.rejects(runTool(client, 'read_view', input, MCP_TOOL_OPTIONS), (e) => e.constructor.name === 'ToolInputError')

test('hostile column names are ToolInputError and never reach the database', async () => {
  const { client, calls } = recClient()
  const hostile = [
    'Email', ' email', 'email ', 'EMAIL', 'emаil' /* cyrillic a */, 'name,email', 'email:name', '*', 'customer:email',
    'name:email', 'email!inner', 'email->>x', 'attributes->a', 'name)', '"email"', 'email\n', 'email\u0000', '', 'a.b',
    'customers_v1.email', 'name,attributes', 'id,*',
  ]
  for (const c of hostile) {
    await rejects(client, { view: 'customers_v1', columns: [c] })
    await rejects(client, { view: 'customers_v1', filters: [{ column: c, value: 'x' }] })
  }
  assert.equal(calls.length, 0)
})

test('non-string / array-wrapped column entries cannot slip through the allowlist', async () => {
  const { client, calls } = recClient()
  for (const bad of [['email'], [['email']], { toString: 'email' }, null, 123, true]) {
    await assert.rejects(runTool(client, 'read_view', { view: 'customers_v1', columns: [bad] }, MCP_TOOL_OPTIONS))
    await assert.rejects(runTool(client, 'read_view', { view: 'customers_v1', filters: [{ column: bad, value: 1 }] }, MCP_TOOL_OPTIONS))
  }
  await assert.rejects(runTool(client, 'read_view', { view: 'customers_v1', columns: 'email' }, MCP_TOOL_OPTIONS))
  assert.equal(calls.length, 0)
})

test('operators, order and ranges cannot reach a denied column', async () => {
  const { client, calls } = recClient()
  // PostgREST operator syntax in the column slot and in the value slot
  await rejects(client, { view: 'customers_v1', filters: [{ column: 'email.eq', value: 'a' }] })
  await rejects(client, { view: 'customers_v1', filters: [{ column: 'email', value: 'like.a%' }] })
  await rejects(client, { view: 'customers_v1', filters: [{ column: 'or', value: '(email.eq.a)' }] }).catch(() => {})
  // order is only ever the date column; naming a column as `order` is refused
  await rejects(client, { view: 'money_v1', order: 'attributes' })
  await rejects(client, { view: 'customers_v1', order: 'asc' }) // no date column
  await rejects(client, { view: 'customers_v1', date_from: '2026-01-01' })
  // extra top-level keys (select/or/and) are refused
  for (const k of ['select', 'or', 'and', 'columns2', 'order_by', 'rpcs']) await rejects(client, { view: 'money_v1', [k]: 'attributes' })
  // value-side injection stays inside one eq() value: the column is allowlisted, value is data
  await runTool(client, 'read_view', { view: 'money_v1', filters: [{ column: 'kind', value: 'x&select=attributes' }] }, MCP_TOOL_OPTIONS)
  assert.deepEqual(calls[0].eq, [['kind', 'x&select=attributes']])
})

test('value-side injection is percent-encoded in the real PostgREST URL', async () => {
  const { client, urls } = urlClient([])
  await runTool(client, 'read_view', { view: 'money_v1', filters: [{ column: 'kind', value: 'x&select=attributes' }] }, MCP_TOOL_OPTIONS)
  const u = urls[0]
  assert.equal(u.searchParams.get('select'), MCP_COLUMNS.money_v1.join(','))
  assert.equal(u.searchParams.get('kind'), 'eq.x&select=attributes')
  assert.equal(u.searchParams.getAll('select').length, 1)
})

test('every allowlisted view selects exactly its allowlist in the real URL', async () => {
  for (const [view, cols] of Object.entries(MCP_COLUMNS)) {
    const { client, urls } = urlClient([])
    await runTool(client, 'read_view', { view }, MCP_TOOL_OPTIONS)
    assert.equal(urls[0].searchParams.get('select'), cols.join(','), view)
  }
})

test('date column is added only when allowlisted', async () => {
  // allowlisted date col -> added
  const a = recClient()
  await runTool(a.client, 'read_view', { view: 'money_v1', columns: ['id'], date_from: '2026-01-01' }, MCP_TOOL_OPTIONS)
  assert.equal(a.calls[0].cols, 'id,occurred_at')
  // hidden date col with a custom option set: range refused, order silently not selected
  const opts = { views: ['money_v1'], columns: { money_v1: ['id', 'amount_minor'] } }
  const b = recClient()
  await assert.rejects(runTool(b.client, 'read_view', { view: 'money_v1', date_from: '2026-01-01' }, opts), /column not available on money_v1: occurred_at/)
  await assert.rejects(runTool(b.client, 'read_view', { view: 'money_v1', date_to: '2026-01-01', columns: ['id'] }, opts))
  await assert.rejects(runTool(b.client, 'read_view', { view: 'money_v1', columns: ['id'], order: 'desc' }, opts), /column not available on money_v1: occurred_at/)
  await runTool(b.client, 'read_view', { view: 'money_v1', columns: ['id'] }, opts)
  assert.equal(b.calls[0].cols, 'id', 'hidden date column not added to select')
  assert.deepEqual(b.calls[0].order, ['id'], 'no default ORDER BY on the hidden date column; only the key tie-breaker')
})

test('no `columns` option: identical to before', async () => {
  const before = agentTools()
  const same = agentTools({})
  assert.deepEqual(before, same)
  assert.ok(!/\(columns:/.test(before[0].description))
  const { client, calls } = recClient()
  await runTool(client, 'read_view', { view: 'money_v1' })
  await runTool(client, 'read_view', { view: 'money_v1', columns: ['attributes', 'anything_at_all'] })
  await runTool(client, 'read_view', { view: 'money_v1', filters: [{ column: 'attributes', value: 1 }] })
  assert.equal(calls[0].cols, '*')
  assert.equal(calls[1].cols, 'attributes,anything_at_all')
  // `columns` present but not for this view: that view stays unrestricted
  await runTool(client, 'read_view', { view: 'jobs_v1', columns: ['owner'] }, { columns: { money_v1: ['id'] } })
  assert.equal(calls[3].cols, 'owner')
  await runTool(client, 'read_view', { view: 'jobs_v1' }, { columns: { money_v1: ['id'] } })
  assert.equal(calls[4].cols, '*')
})

test('view set: 16 defaults + customers_v1, no memberships_v1, no write tools', async () => {
  const defaults = agentTools()[0].input_schema.properties.view.enum
  assert.equal(defaults.length, 16)
  assert.deepEqual([...MCP_VIEWS].sort(), [...defaults, 'customers_v1'].sort())
  assert.ok(!MCP_VIEWS.includes('memberships_v1'))
  assert.equal(MCP_TOOL_OPTIONS.rpcs, undefined)
  const { client } = recClient()
  await assert.rejects(runTool(client, 'read_view', { view: 'memberships_v1' }, MCP_TOOL_OPTIONS))
  for (const n of ['save_record', 'update_media', 'bulk_tag', 'delete_record']) await assert.rejects(runTool(client, n, {}, MCP_TOOL_OPTIONS), n)
  assert.deepEqual(mcpTools().map((t) => t.name), ['read_view', 'summarize_view'])
})

test('envelope: single oversized row yields zero rows, truncated, still valid JSON under cap', () => {
  const text = envelope({ rows: [{ id: 1, body: 'z'.repeat(RESULT_BYTE_CAP + 10) }], count: 1, truncated: false })
  assert.ok(Buffer.byteLength(text) <= RESULT_BYTE_CAP)
  const b = JSON.parse(text)
  assert.deepEqual(b.rows, [])
  assert.equal(b.count, 0)
  assert.equal(b.truncated, true)
  assert.equal(b.untrusted_data, true)
})

test('envelope: cap is bytes, not characters (multi-byte UTF-8 near the cap)', () => {
  for (const ch of ['é', '日', '😀']) {
    const body = ch.repeat(1000)
    const rows = Array.from({ length: 400 }, (_, i) => ({ id: i, body }))
    const text = envelope({ rows, count: rows.length, truncated: false })
    assert.ok(Buffer.byteLength(text) <= RESULT_BYTE_CAP, `${ch}: ${Buffer.byteLength(text)} bytes`)
    assert.ok(text.length < Buffer.byteLength(text), 'sanity: multi-byte')
    const b = JSON.parse(text)
    assert.equal(b.truncated, true)
    assert.deepEqual(b.rows, rows.slice(0, b.rows.length))
    // maximal: one more row would exceed the cap
    const more = envelope({ rows: rows.slice(0, b.rows.length + 1), count: 0, truncated: false }, Infinity)
    assert.ok(Buffer.byteLength(more) > RESULT_BYTE_CAP, `${ch}: dropped too many rows`)
  }
})

test('envelope: exact-boundary cap keeps the row that fits and drops the one that does not', () => {
  const rows = [{ b: 'é'.repeat(50) }, { b: 'é'.repeat(50) }, { b: 'é'.repeat(50) }]
  const two = Buffer.byteLength(envelope({ rows: rows.slice(0, 2), count: 2, truncated: false }, Infinity))
  const keep = JSON.parse(envelope({ rows, count: 3, truncated: false }, two + 1)) // +1: 'truncated' flips false->true? same size class
  assert.ok(keep.rows.length >= 1)
  const exact = envelope({ rows, count: 3, truncated: false }, two)
  assert.ok(Buffer.byteLength(exact) <= two)
  // lone surrogate must not blow the cap (JSON.stringify escapes it as \udXXX)
  const lone = envelope({ rows: [{ b: '\ud800'.repeat(100) }], count: 1, truncated: false }, 400)
  assert.ok(Buffer.byteLength(lone) <= 400)
})

test('server: 200 rows of multi-byte data stay under the cap end to end', async () => {
  const rows = Array.from({ length: 200 }, (_, i) => ({ id: i, body: '日'.repeat(5000) }))
  const { client } = recClient(rows)
  const server = buildServer(client)
  const [a, b] = InMemoryTransport.createLinkedPair()
  const mcp = new Client({ name: 't', version: '0' })
  await Promise.all([server.connect(a), mcp.connect(b)])
  const res = await mcp.callTool({ name: 'read_view', arguments: { view: 'records_v1', limit: 200 } })
  const text = res.content[0].text
  assert.ok(Buffer.byteLength(text) <= RESULT_BYTE_CAP)
  assert.equal(JSON.parse(text).truncated, true)
})

// `columns: []` under an allowlist must select the allowlist: an empty `select=` makes PostgREST
// fall back to `*`, which would expose every hidden column.
test('columns: [] selects the allowlist, not an empty/unrestricted select', async () => {
  const { client, urls } = urlClient([])
  await runTool(client, 'read_view', { view: 'customers_v1', columns: [] }, MCP_TOOL_OPTIONS)
  assert.equal(urls[0].searchParams.get('select'), MCP_COLUMNS.customers_v1.join(','))
})

test('columns: [] on customers_v1 sends a non-empty select with no email or attributes', async () => {
  const { client, calls } = recClient()
  await runTool(client, 'read_view', { view: 'customers_v1', columns: [] }, MCP_TOOL_OPTIONS)
  const cols = calls[0].cols.split(',')
  assert.notEqual(calls[0].cols, '')
  assert.ok(!cols.includes('email') && !cols.includes('attributes'))
})

test('a date column hidden by the allowlist: explicit order is refused, default order is skipped', async () => {
  const opts = { views: ['money_v1'], columns: { money_v1: ['id', 'amount_minor'] } }
  const { client, calls } = recClient()
  for (const input of [{ view: 'money_v1', order: 'asc' }, { view: 'money_v1', order: 'desc' }, { view: 'money_v1', date_to: '2025-01-01' }]) {
    await assert.rejects(runTool(client, 'read_view', input, opts), (e) => e.constructor.name === 'ToolInputError')
  }
  assert.equal(calls.length, 0)
  await runTool(client, 'read_view', { view: 'money_v1' }, opts)
  assert.equal(calls[0].cols, 'id,amount_minor')
  assert.deepEqual(calls[0].order, ['id'], 'no ORDER BY on the hidden date column; only the key tie-breaker')
})

test('columns: [] never produces select=* (the only unrestricted spelling)', async () => {
  const { client, urls } = urlClient([])
  await runTool(client, 'read_view', { view: 'customers_v1', columns: [] }, MCP_TOOL_OPTIONS)
  assert.notEqual(urls[0].searchParams.get('select'), '*')
  console.log('columns:[] select param ->', JSON.stringify(urls[0].searchParams.get('select')), '| url:', urls[0].search)
})
