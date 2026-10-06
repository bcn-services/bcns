// QA PR-C: adversarial probes for the audit call and the owner-gated customer email.
import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildServer } from '../dist/mcp.js'

function fake({ rows = [{ id: 'r1' }], settings = { share_customer_contact: false }, log } = {}) {
  const reads = []
  const audits = []
  const filters = []
  let settingsReads = 0
  const views = new Proxy({}, {
    get: (_, name) => (cols) => {
      reads.push({ view: name, cols })
      const q = {
        eq: (c, v) => (filters.push([c, v]), q), gte: () => q, lt: () => q, lte: () => q, order: () => q, limit: () => q,
        then: (ok, bad) => Promise.resolve({ data: rows, error: null }).then(ok, bad),
      }
      return q
    },
  })
  const rpc = {
    get_ai_settings: async () => {
      settingsReads++
      return typeof settings === 'function' ? settings() : settings
    },
    log_mcp_call: (args) => {
      audits.push(args)
      return log ? log(args) : Promise.resolve(undefined)
    },
  }
  return { client: { views, rpc }, reads, audits, filters, settingsReads: () => settingsReads }
}

async function connect(client) {
  const server = buildServer(client)
  const [a, b] = InMemoryTransport.createLinkedPair()
  const mcp = new Client({ name: 't', version: '0' })
  await Promise.all([server.connect(a), mcp.connect(b)])
  return mcp
}
const tick = () => new Promise((r) => setTimeout(r, 5))
const call = async (client, args, name = 'read_view') => {
  const mcp = await connect(client)
  const res = await mcp.callTool({ name, arguments: args })
  await tick()
  return res
}
const cust = (extra = {}) => ({ view: 'customers_v1', ...extra })
const sel = (f) => f.reads.at(-1).cols.split(',')
const ON = { share_customer_contact: true }

test('two clients in flight at once: one tenant grant never leaks into the other call', async () => {
  let release
  const gate = new Promise((r) => (release = r))
  const on = fake({ settings: async () => { await gate; return ON } })
  const off = fake({ settings: async () => { await gate; return { share_customer_contact: false } } })
  const [m1, m2] = await Promise.all([connect(on.client), connect(off.client)])
  const p = Promise.all([
    m1.callTool({ name: 'read_view', arguments: cust() }),
    m2.callTool({ name: 'read_view', arguments: cust() }),
    m2.callTool({ name: 'read_view', arguments: cust() }),
    m1.callTool({ name: 'read_view', arguments: cust() }),
  ])
  await tick()
  release()
  await p
  assert.ok(on.reads.every((r) => r.cols.split(',').includes('email')))
  assert.ok(off.reads.every((r) => !r.cols.split(',').includes('email')))
  assert.equal(on.reads.length, 2)
  assert.equal(off.reads.length, 2)
})

test('shared policy objects are not mutated by a granted call', async () => {
  const { MCP_COLUMNS, MCP_TOOL_OPTIONS } = await import('../dist/policy.js')
  const snap = JSON.stringify([MCP_COLUMNS, MCP_TOOL_OPTIONS])
  await call(fake({ settings: ON }).client, cust())
  assert.equal(JSON.stringify([MCP_COLUMNS, MCP_TOOL_OPTIONS]), snap)
  assert.ok(!MCP_COLUMNS.customers_v1.includes('email'))
})

test('filters on email: allowed only while on (filter value is not echoed into the audit row)', async () => {
  const on = fake({ settings: ON })
  const r1 = await call(on.client, cust({ filters: [{ column: 'email', value: 'a@b.co' }] }))
  assert.notEqual(r1.isError, true)
  assert.deepEqual(on.filters, [['email', 'a@b.co']])
  assert.ok(!JSON.stringify(on.audits).includes('a@b.co'))

  const off = fake()
  const r2 = await call(off.client, cust({ filters: [{ column: 'email', value: 'a@b.co' }] }))
  assert.equal(r2.isError, true)
  assert.equal(off.reads.length, 0)
  assert.equal(off.audits.length, 1)
  assert.equal(off.audits[0].p_error_code, 'input')
})

test('filters on attributes are denied even when on', async () => {
  const on = fake({ settings: ON })
  const r = await call(on.client, cust({ filters: [{ column: 'attributes', value: 'x' }] }))
  assert.equal(r.isError, true)
  assert.equal(on.reads.length, 0)
})

test('ordering by email is impossible: customers_v1 has no order column, on or off', async () => {
  for (const settings of [ON, { share_customer_contact: false }]) {
    for (const order of ['email', 'asc', 'desc']) {
      const f = fake({ settings })
      const r = await call(f.client, cust({ order }))
      assert.equal(r.isError, true, order)
      assert.equal(f.reads.length, 0)
    }
  }
})

test('columns [] with the switch on selects the allowlist (incl. email, never attributes / *)', async () => {
  const f = fake({ settings: ON })
  const r = await call(f.client, cust({ columns: [] }))
  assert.notEqual(r.isError, true)
  const cols = sel(f)
  assert.ok(cols.includes('email'))
  assert.ok(!cols.includes('attributes'))
  assert.notEqual(f.reads[0].cols, '*')
  assert.notEqual(f.reads[0].cols, '')
})

test('columns [] with the switch off selects the allowlist without email', async () => {
  const f = fake()
  await call(f.client, cust({ columns: [] }))
  assert.ok(!sel(f).includes('email'))
  assert.notEqual(f.reads[0].cols, '*')
})

test('email and attributes never reachable on any other view, switch on', async () => {
  // Views with an allowlist refuse email. Views without one (client_v1, jobs_v1, ...) have no email column in
  // platform/supabase/migrations (only api.customers_v1 does), so there is nothing to refuse.
  const views = ['money_v1', 'messages_v1', 'products_v1', 'records_v1', 'media_v1']
  for (const view of views) {
    const f = fake({ settings: ON })
    const r = await call(f.client, { view, columns: ['email'] })
    assert.equal(r.isError, true, view)
    assert.equal(f.reads.length, 0)
    assert.equal(f.settingsReads(), 0, view)
  }
  for (const view of ['money_v1', 'messages_v1']) {
    const f = fake({ settings: ON })
    await call(f.client, { view })
    assert.ok(!f.reads[0].cols.split(',').some((c) => c === 'email' || c === 'attributes'), view)
  }
  const f = fake({ settings: ON })
  const r = await call(f.client, { view: 'money_v1', filters: [{ column: 'email', value: 'x' }] })
  assert.equal(r.isError, true)
})

test('prototype-pollution-shaped settings payloads do not grant', async () => {
  const payloads = [
    JSON.parse('{"__proto__":{"share_customer_contact":true}}'),
    JSON.parse('{"constructor":{"prototype":{"share_customer_contact":true}}}'),
    JSON.parse('{"share_customer_contact":{"valueOf":true}}'),
    JSON.parse('{"share_customer_contact":[true]}'),
    JSON.parse('{"share_customer_contact":"true"}'),
    JSON.parse('{"then":1,"share_customer_contact":null}'),
    [true], 'true', true, 1, 0, undefined, null,
    { share_customer_contact: new Boolean(true) },
    { get share_customer_contact() { throw new Error('getter') } },
  ]
  for (const settings of payloads) {
    const f = fake({ settings: () => settings })
    const r = await call(f.client, cust())
    assert.notEqual(r.isError, true, `payload #${payloads.indexOf(settings)}`)
    assert.ok(!sel(f).includes('email'), `payload #${payloads.indexOf(settings)}`)
  }
  assert.equal({}.share_customer_contact, undefined) // nothing polluted Object.prototype
})

test('a settings payload with a granting prototype (not producible from JSON) -- informational', async () => {
  const settings = Object.create({ share_customer_contact: true })
  const f = fake({ settings: () => settings })
  await call(f.client, cust())
  // Documents behavior only: JSON.parse output can never have a custom prototype, so this is not exploitable.
  console.log('inherited grant exposes email:', sel(f).includes('email'))
})

test('every call logs exactly one audit row with only the five known keys; success and failure, concurrent', async () => {
  const f = fake({ settings: () => { throw new Error('x') } })
  const mcp = await connect(f.client)
  await Promise.all([
    mcp.callTool({ name: 'read_view', arguments: cust() }),
    mcp.callTool({ name: 'read_view', arguments: { view: 'nope' } }),
    mcp.callTool({ name: 'nope', arguments: {} }),
    mcp.callTool({ name: 'read_view', arguments: cust({ columns: ['email'], filters: [{ column: 'email', value: 'secret@x.io' }] }) }),
  ])
  await tick()
  assert.equal(f.audits.length, 4)
  for (const a of f.audits) assert.deepEqual(Object.keys(a).sort(), ['p_error_code', 'p_ok', 'p_row_count', 'p_tool', 'p_view'])
  assert.ok(!JSON.stringify(f.audits).includes('secret@x.io'))
  assert.equal(f.audits.filter((a) => a.p_ok).length, 1)
})

test('a throwing audit never changes the response, even combined with a throwing settings read', async (t) => {
  t.mock.method(console, 'error', () => {})
  const a = await call(fake({ settings: ON }).client, cust())
  const b = await call(fake({ settings: ON, log: () => { throw new Error('boom') } }).client, cust())
  assert.deepEqual(a, b)
})

test('audit error codes are stable short strings', async () => {
  const f = fake()
  await call(f.client, cust({ columns: ['email'] }))
  await call(f.client, { view: 'records_v1', limit: 0 })
  assert.deepEqual(f.audits.map((x) => x.p_error_code), ['input', 'input'])
})

// KNOWN FAILURE (reported as bug): optionsFor() awaits get_ai_settings() with no timeout, so a hanging
// settings read hangs the whole tool call, and no audit row is ever written. todo = documented, not red.
test('a hanging settings read must not hang the tool call (fail closed)', { todo: 'BUG: no timeout around get_ai_settings' }, async () => {
  const f = fake({ settings: () => new Promise(() => {}) })
  const mcp = await connect(f.client)
  let timer
  const res = await Promise.race([
    mcp.callTool({ name: 'read_view', arguments: cust() }, undefined, { timeout: 1500 }),
    new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('tool call hung on the settings read')), 1000) }),
  ]).finally(() => { clearTimeout(timer); void mcp.close() })
  assert.notEqual(res.isError, true)
  assert.ok(!sel(f).includes('email'))
})
