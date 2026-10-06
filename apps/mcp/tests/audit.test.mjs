// PR-C: every tools/call writes one audit row through the caller's own DataClient (fire-and-forget),
// and a customers_v1 read gets `email` only while the owner's contact-sharing switch is on.
import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildServer } from '../dist/mcp.js'

/** Fake DataClient: records the select string per view read, every audit call, every settings read.
 *  `settings` is a value, or a function that may throw / reject. */
function fake({ rows = [{ id: 'r1' }], settings = { share_customer_contact: false }, log } = {}) {
  const reads = []
  const audits = []
  let settingsReads = 0
  const views = new Proxy({}, {
    get: (_, name) => (cols) => {
      reads.push({ view: name, cols })
      const q = {
        eq: () => q, gte: () => q, lt: () => q, lte: () => q, order: () => q, limit: () => q,
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
  return { client: { views, rpc }, reads, audits, settingsReads: () => settingsReads }
}

async function connect(client) {
  const server = buildServer(client)
  const [a, b] = InMemoryTransport.createLinkedPair()
  const mcp = new Client({ name: 't', version: '0' })
  await Promise.all([server.connect(a), mcp.connect(b)])
  return mcp
}

const tick = () => new Promise((r) => setImmediate(r))
const call = async (client, args, name = 'read_view') => {
  const mcp = await connect(client)
  const res = await mcp.callTool({ name, arguments: args })
  await tick() // let the fire-and-forget audit settle
  return res
}

test('success: one audit row with tool, view, row count, ok and no error code', async () => {
  const f = fake({ rows: [{ id: 'a' }, { id: 'b' }] })
  const res = await call(f.client, { view: 'records_v1' })
  assert.notEqual(res.isError, true)
  assert.deepEqual(f.audits, [{ p_tool: 'read_view', p_view: 'records_v1', p_row_count: 2, p_ok: true, p_error_code: null }])
  assert.equal(f.settingsReads(), 0)
})

test('error: rejected input still logs, with a short code and no row count', async () => {
  const f = fake()
  const res = await call(f.client, { view: 'records_v1', columns: ['not a column!'] })
  assert.equal(res.isError, true)
  assert.deepEqual(f.audits, [{ p_tool: 'read_view', p_view: 'records_v1', p_row_count: null, p_ok: false, p_error_code: 'input' }])
  assert.equal(f.reads.length, 0)
})

test('an unknown tool logs too, and a non-string view is logged as null', async () => {
  const f = fake()
  const res = await call(f.client, { view: { evil: true } }, 'drop_everything')
  assert.equal(res.isError, true)
  assert.deepEqual(f.audits, [{ p_tool: 'drop_everything', p_view: null, p_row_count: null, p_ok: false, p_error_code: 'input' }])
})

test('an unexpected failure logs the generic code, never the message', async () => {
  const f = fake()
  f.client.views = new Proxy({}, { get: () => () => { throw new Error('connect ECONNREFUSED 10.0.0.7') } })
  const res = await call(f.client, { view: 'records_v1' })
  assert.equal(res.isError, true)
  assert.equal(f.audits[0].p_error_code, 'internal')
  assert.ok(!JSON.stringify(f.audits).includes('10.0.0.7'))
})

test('an audit failure does not change the response; one JSON stderr line, no token or rows', async (t) => {
  const lines = []
  t.mock.method(console, 'error', (line) => lines.push(line))
  const good = await call(fake({ rows: [{ id: 'secret-row-value' }] }).client, { view: 'records_v1' })
  const f = fake({ rows: [{ id: 'secret-row-value' }], log: () => Promise.reject(new Error('Bearer eyJhbGciOi.secret.token')) })
  const res = await call(f.client, { view: 'records_v1' })
  assert.deepEqual(res, good)
  assert.equal(lines.length, 1)
  const parsed = JSON.parse(lines[0])
  assert.deepEqual(parsed, { level: 'error', event: 'mcp_audit_failed', code: 'internal' })
  assert.ok(!lines[0].includes('eyJ') && !lines[0].includes('secret-row-value'))
})

test('a synchronously throwing or missing audit call is swallowed too', async (t) => {
  const lines = []
  t.mock.method(console, 'error', (line) => lines.push(line))
  const f = fake({ log: () => { throw new Error('boom') } })
  assert.notEqual((await call(f.client, { view: 'records_v1' })).isError, true)
  const g = fake()
  delete g.client.rpc.log_mcp_call
  assert.notEqual((await call(g.client, { view: 'records_v1' })).isError, true)
  assert.equal(lines.length, 2)
})

test('a hanging audit call does not delay the response', async () => {
  const f = fake({ log: () => new Promise(() => {}) })
  const mcp = await connect(f.client)
  const res = await Promise.race([
    mcp.callTool({ name: 'read_view', arguments: { view: 'records_v1' } }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('response waited on the audit call')), 2000)),
  ])
  assert.notEqual(res.isError, true)
})

const customers = (args = {}) => ({ view: 'customers_v1', ...args })
const selectOf = (f) => f.reads.at(-1).cols.split(',')

test('email is hidden when the switch is off, the setting row is missing, or its shape is odd', async () => {
  for (const settings of [{ share_customer_contact: false }, null, {}, { share_customer_contact: 'true' }, { share_customer_contact: 1 }]) {
    const f = fake({ settings })
    const res = await call(f.client, customers())
    assert.notEqual(res.isError, true)
    assert.ok(!selectOf(f).includes('email'), JSON.stringify(settings))
    assert.ok(selectOf(f).includes('name'))
  }
})

test('email is hidden when the settings read errors (fail closed)', async () => {
  for (const settings of [() => { throw new Error('rpc down') }, () => Promise.reject(new Error('rpc down'))]) {
    const f = fake({ settings })
    const res = await call(f.client, customers())
    assert.notEqual(res.isError, true)
    assert.ok(!selectOf(f).includes('email'))
  }
  const noRpc = fake()
  delete noRpc.client.rpc.get_ai_settings
  await call(noRpc.client, customers())
  assert.ok(!selectOf(noRpc).includes('email'))
})

test('email is present when the switch is on, with and without explicit columns', async () => {
  const f = fake({ settings: { share_customer_contact: true } })
  await call(f.client, customers())
  assert.ok(selectOf(f).includes('email'))
  assert.ok(!selectOf(f).includes('attributes'))

  const g = fake({ settings: { share_customer_contact: true } })
  const res = await call(g.client, customers({ columns: ['name', 'email'] }))
  assert.notEqual(res.isError, true)
  assert.deepEqual(selectOf(g), ['name', 'email'])
  assert.equal(g.audits[0].p_ok, true)
})

test('columns ["email"] is denied when off, and attributes is denied even when on', async () => {
  const off = fake()
  const res = await call(off.client, customers({ columns: ['email'] }))
  assert.equal(res.isError, true)
  assert.equal(off.reads.length, 0)
  assert.equal(off.audits[0].p_error_code, 'input')

  const on = fake({ settings: { share_customer_contact: true } })
  for (const column of ['attributes']) {
    const r = await call(on.client, customers({ columns: [column] }))
    assert.equal(r.isError, true)
  }
  assert.equal(on.reads.length, 0)
})

test('one settings read per customers_v1 call, none for other views, and the grant does not stick', async () => {
  const f = fake({ settings: { share_customer_contact: true } })
  const mcp = await connect(f.client)
  await mcp.callTool({ name: 'read_view', arguments: customers() })
  assert.equal(f.settingsReads(), 1)
  await mcp.callTool({ name: 'read_view', arguments: { view: 'money_v1' } })
  await mcp.callTool({ name: 'read_view', arguments: { view: 'records_v1' } })
  assert.equal(f.settingsReads(), 1)
  await mcp.callTool({ name: 'read_view', arguments: customers() })
  assert.equal(f.settingsReads(), 2)

  // Switch flips off between calls: the next call is hidden again.
  let on = true
  const g = fake({ settings: () => ({ share_customer_contact: on }) })
  const m = await connect(g.client)
  await m.callTool({ name: 'read_view', arguments: customers() })
  assert.ok(selectOf(g).includes('email'))
  on = false
  await m.callTool({ name: 'read_view', arguments: customers() })
  assert.ok(!selectOf(g).includes('email'))
})

test('the customers_v1 description says email depends on the owner switch', async () => {
  const mcp = await connect(fake().client)
  const { tools } = await mcp.listTools()
  assert.match(tools[0].description, /appears only if the business owner turned on contact sharing/)
})
