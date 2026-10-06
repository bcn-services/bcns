// Shared fixtures for the PR-F query tests: a stateful fake client (see fake()) plus MCP plumbing.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { ToolInputError, runTool } from '@bcn-services/data-client'
import { buildServer } from '../dist/mcp.js'
import { MCP_TOOL_OPTIONS } from '../dist/policy.js'

/** PostgREST's default max_rows; a fake can lower it with the `maxRows` option. */
const MAX_ROWS = 1000

export const cmp = (a, b) => (a === b ? 0 : a < b ? -1 : 1)
/** Postgres order: NULLs sort last ascending, first descending. */
function compare(a, b, asc) {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : asc ? 1 : -1
  if (b === null || b === undefined) return asc ? -1 : 1
  return asc ? cmp(a, b) : cmp(b, a)
}
const likeRegex = (pattern) => {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === '\\') re += (pattern[++i] ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    else if (ch === '%') re += '.*'
    else if (ch === '_') re += '.'
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`, 'is')
}
const OPS = {
  // PostgREST reads `eq.null` as the text 'null', never as IS NULL (that is `is.null`).
  eq: (v, x) => (x === null ? v === 'null' : v === x),
  neq: (v, x) => (x === null ? v !== null && v !== 'null' : v !== x),
  is: (v) => v === null,
  notis: (v) => v !== null,
  gt: (v, x) => v !== null && v !== undefined && v > x,
  gte: (v, x) => v !== null && v !== undefined && v >= x,
  lt: (v, x) => v !== null && v !== undefined && v < x,
  lte: (v, x) => v !== null && v !== undefined && v <= x,
  ilike: (v, x) => typeof v === 'string' && likeRegex(x).test(v),
}

/** `tables` maps view name -> full rows (hidden columns included). Rows come back in an arbitrary
 *  (per-request shuffled) order unless sorted, like an unordered SELECT, then are projected to the
 *  selected columns, so a leak of a hidden column or an unstable page shows up in the result. */
export function fake(tables, { settings = { share_customer_contact: false }, maxRows = MAX_ROWS } = {}) {
  const requests = []
  const audits = []
  const run = (req, seq) => {
    req.ran = true // the builder was awaited: a real request would have gone out
    let rows = tables[req.view] ?? []
    for (const [op, c, v] of req.filters) rows = rows.filter((r) => OPS[op](r[c] ?? null, v))
    rows = rows
      .map((r, i) => [(i * 2654435761 + seq * 40503) % 1000003, r])
      .sort((a, b) => a[0] - b[0])
      .map((x) => x[1])
    rows = rows.sort((a, b) => {
      for (const [c, asc] of req.orders) {
        const d = compare(a[c], b[c], asc)
        if (d !== 0) return d
      }
      return 0
    })
    const [from, to] = req.range ?? [0, (req.limit ?? maxRows) - 1]
    rows = rows.slice(from, Math.min(to + 1, from + maxRows))
    if (req.cols === '*') return rows
    const cols = req.cols.split(',')
    return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])))
  }
  const views = new Proxy({}, {
    get: (_, view) => (cols) => {
      const req = { view, cols, filters: [], orders: [], range: null, limit: null }
      const seq = requests.push(req)
      const filter = (op) => (c, v) => (req.filters.push([op, c, v]), q)
      const q = {
        eq: filter('eq'), neq: filter('neq'), gt: filter('gt'), gte: filter('gte'), lt: filter('lt'), lte: filter('lte'),
        ilike: filter('ilike'),
        is: (c) => (req.filters.push(['is', c, null]), q),
        not: (c, op) => (req.filters.push([`not${op}`, c, null]), q),
        order: (c, o) => (req.orders.push([c, o.ascending]), q),
        range: (a, b) => ((req.range = [a, b]), q),
        limit: (n) => ((req.limit = n), q),
        then: (ok, bad) => Promise.resolve({ data: run(req, seq), error: null }).then(ok, bad),
      }
      return q
    },
  })
  const rpc = {
    get_ai_settings: async () => settings,
    log_mcp_call: async (args) => void audits.push(args),
  }
  return { client: { views, rpc }, requests, audits }
}

export async function connect(client) {
  const server = buildServer(client)
  const [a, b] = InMemoryTransport.createLinkedPair()
  const mcp = new Client({ name: 't', version: '0' })
  await Promise.all([server.connect(a), mcp.connect(b)])
  return mcp
}
export const tick = () => new Promise((r) => setImmediate(r))

/** Calls a tool through the real MCP server; returns the parsed body, or { error } for isError. */
export async function ask(f, name, args) {
  const mcp = await connect(f.client)
  const res = await mcp.callTool({ name, arguments: args })
  await tick()
  const text = res.content[0].text
  return res.isError ? { error: text } : JSON.parse(text)
}
export const read = (f, args) => ask(f, 'read_view', args)
export const summarize = (f, args) => ask(f, 'summarize_view', args)
export const direct = (f, name, input, opts = MCP_TOOL_OPTIONS) => runTool(f.client, name, input, opts)
export const inputError = (e) => e instanceof ToolInputError

// ---- fixtures -----------------------------------------------------------------------------------

/** 450 customers with distinct spend values in scrambled order. */
export const customers450 = Array.from({ length: 450 }, (_, i) => ({
  id: `c${String(i).padStart(4, '0')}`, client_id: 'k', name: `Customer ${i}`, email: `c${i}@x.test`,
  total_spent_minor: (i * 7919) % 100003, orders_count: i % 13, currency: 'usd', attributes: { secret: i },
}))

export const DAY = 86_400_000
/** n money rows over 2026: every row is 'order' or 'refund', amounts and days deterministic. */
export function moneyRows(n, { currency = () => 'usd' } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    id: `m${String(i).padStart(6, '0')}`, client_id: 'k', kind: i % 4 === 0 ? 'refund' : 'order', status: 'paid',
    occurred_at: new Date(Date.UTC(2026, 0, 1) + ((i * 37) % 330) * DAY + (i % 24) * 3_600_000).toISOString(),
    amount_minor: 100 + (i % 17), currency: currency(i), attributes: { pii: 'x' },
  }))
}
export const monthOf = (iso) => iso.slice(0, 7)
