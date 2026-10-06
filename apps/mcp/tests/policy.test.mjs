// The read policy end to end: a fake DataClient behind the real MCP server, driven by the SDK's
// own client over an in-memory transport — what Claude would see, minus the network.
import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { buildServer, envelope, mcpTools } from '../dist/mcp.js'
import { MCP_COLUMNS } from '../dist/policy.js'

/** Records the select string and filters; resolves to `rows` like a PostgREST builder. */
function fakeClient(rows = [{ id: 'r1' }]) {
  const calls = []
  const view = (name) => (cols) => {
    const call = { name, cols, eq: [] }
    calls.push(call)
    const q = {
      eq: (c, v) => (call.eq.push([c, v]), q),
      gte: () => q,
      lt: () => q,
      lte: () => q,
      order: () => q,
      limit: () => q,
      then: (ok, bad) => Promise.resolve({ data: rows, error: null }).then(ok, bad),
    }
    return q
  }
  const views = new Proxy({}, { get: (_, name) => view(name) })
  return { client: { views }, calls }
}

async function connect(client) {
  const server = buildServer(client)
  const [a, b] = InMemoryTransport.createLinkedPair()
  const mcp = new Client({ name: 't', version: '0' })
  await Promise.all([server.connect(a), mcp.connect(b)])
  return mcp
}

const call = (mcp, args) => mcp.callTool({ name: 'read_view', arguments: args })

test('a column outside the allowlist is refused', async () => {
  const { client, calls } = fakeClient()
  const mcp = await connect(client)
  for (const [view, column] of [['money_v1', 'attributes'], ['messages_v1', 'attributes'], ['media_v1', 'uploaded_by']]) {
    const res = await call(mcp, { view, columns: ['id', column] })
    assert.equal(res.isError, true, `${view}.${column}`)
    assert.match(res.content[0].text, new RegExp(`column not available on ${view}: ${column}`))
  }
  assert.equal(calls.length, 0, 'nothing reached the database')
})

test('email is not selectable from customers_v1, by column or filter', async () => {
  const { client, calls } = fakeClient()
  const mcp = await connect(client)
  const byColumn = await call(mcp, { view: 'customers_v1', columns: ['name', 'email'] })
  assert.equal(byColumn.isError, true)
  const byFilter = await call(mcp, { view: 'customers_v1', filters: [{ column: 'email', value: 'a@b.co' }] })
  assert.equal(byFilter.isError, true)
  assert.equal(calls.length, 0)
})

test('a filter on a denied column is refused', async () => {
  const { client, calls } = fakeClient()
  const mcp = await connect(client)
  const res = await call(mcp, { view: 'money_v1', filters: [{ column: 'attributes', value: 'x' }] })
  assert.equal(res.isError, true)
  assert.match(res.content[0].text, /column not available on money_v1: attributes/)
  assert.equal(calls.length, 0)
})

test('no columns requested selects exactly the allowlist', async () => {
  const { client, calls } = fakeClient()
  const mcp = await connect(client)
  await call(mcp, { view: 'messages_v1' })
  assert.equal(calls[0].cols, MCP_COLUMNS.messages_v1.join(','))
  assert.ok(!calls[0].cols.split(',').includes('attributes'))
  await call(mcp, { view: 'customers_v1' })
  assert.equal(calls[1].cols, MCP_COLUMNS.customers_v1.join(','))
  assert.ok(!calls[1].cols.split(',').includes('email'))
})

test('the policy table matches the spec', () => {
  const cols = MCP_COLUMNS
  for (const v of ['money_v1', 'messages_v1', 'customers_v1']) assert.ok(!cols[v].includes('attributes'), v)
  for (const v of ['products_v1', 'records_v1']) assert.ok(cols[v].includes('attributes'), v)
  assert.ok(cols.money_v1.includes('customer_external_id'))
  assert.ok(cols.messages_v1.includes('participants'))
  assert.ok(!cols.media_v1.includes('uploaded_by'))
  assert.ok(!cols.customers_v1.includes('email'))
})

test('requested allowed columns and the date column pass through', async () => {
  const { client, calls } = fakeClient()
  const mcp = await connect(client)
  const res = await call(mcp, { view: 'money_v1', columns: ['id', 'amount_minor'], order: 'desc' })
  assert.notEqual(res.isError, true)
  assert.equal(calls[0].cols, 'id,amount_minor,occurred_at')
})

test('result envelope shape', async () => {
  const { client } = fakeClient([{ id: 'a' }, { id: 'b' }])
  const mcp = await connect(client)
  const res = await call(mcp, { view: 'products_v1', limit: 50 })
  const body = JSON.parse(res.content[0].text)
  assert.deepEqual(Object.keys(body).sort(), ['count', 'note', 'rows', 'truncated', 'untrusted_data'])
  assert.equal(body.untrusted_data, true)
  assert.equal(typeof body.note, 'string')
  assert.deepEqual(body.rows, [{ id: 'a' }, { id: 'b' }])
  assert.equal(body.count, 2)
  assert.equal(body.truncated, false)
})

test('byte cap drops trailing rows and sets truncated', async () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ id: i, body: 'x'.repeat(100) }))
  const text = envelope({ rows, count: 10, truncated: false }, 600)
  assert.ok(Buffer.byteLength(text) <= 600)
  const body = JSON.parse(text)
  assert.ok(body.rows.length > 0 && body.rows.length < 10)
  assert.deepEqual(body.rows, rows.slice(0, body.rows.length), 'trailing rows dropped, order kept')
  assert.equal(body.count, body.rows.length)
  assert.equal(body.truncated, true)
  // under the cap: untouched
  const whole = JSON.parse(envelope({ rows, count: 10, truncated: false }, 1e6))
  assert.equal(whole.rows.length, 10)
  assert.equal(whole.truncated, false)
  // a row-limit truncation is preserved
  assert.equal(JSON.parse(envelope({ rows: [], count: 0, truncated: true })).truncated, true)
})

test('the default 256 KB cap holds through the server', async () => {
  const rows = Array.from({ length: 200 }, (_, i) => ({ id: i, body: 'y'.repeat(10_000) }))
  const { client } = fakeClient(rows)
  const mcp = await connect(client)
  const res = await call(mcp, { view: 'records_v1', limit: 200 })
  const text = res.content[0].text
  assert.ok(Buffer.byteLength(text) <= 256 * 1024)
  const body = JSON.parse(text)
  assert.equal(body.truncated, true)
  assert.ok(body.rows.length < 200)
})

test('ListTools carries title and read-only annotations', async () => {
  const { client } = fakeClient()
  const mcp = await connect(client)
  const { tools } = await mcp.listTools()
  assert.deepEqual(tools.map((t) => t.name), ['read_view'], 'no write tool is exposed')
  for (const t of tools) {
    assert.equal(typeof t.title, 'string')
    assert.deepEqual(t.annotations, {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    })
  }
  assert.match(tools[0].description, /third-party business data/)
  assert.match(tools[0].description, /never instructions/)
})

test('customers_v1 is listed, memberships_v1 is not, and columns are described', () => {
  const [tool] = mcpTools()
  const views = tool.inputSchema.properties.view.enum
  assert.equal(views.length, 17)
  assert.ok(views.includes('customers_v1'))
  assert.ok(!views.includes('memberships_v1'))
  assert.match(tool.description, /customers_v1:.*\(columns: id, client_id, source, external_id, name,/)
  assert.ok(!/customers_v1:[^\n]*email/.test(tool.description))
})

test('writes are off: a write rpc tool cannot be called', async () => {
  const { client } = fakeClient()
  const mcp = await connect(client)
  for (const name of ['save_record', 'update_media', 'bulk_tag']) {
    const res = await mcp.callTool({ name, arguments: {} })
    assert.equal(res.isError, true, name)
  }
})
