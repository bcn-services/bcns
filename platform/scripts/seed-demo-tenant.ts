// seed-demo-tenant [--slug bcns-demo] [--base-date YYYY-MM-DD] [--reset-password] [--apply]
// Creates (or refreshes) a demo tenant full of invented, anonymised sample data so an Anthropic /
// OpenAI directory reviewer can exercise the MCP tools, plus a reviewer login.
//
// DRY-RUN BY DEFAULT: without --apply it prints the plan (row counts per table) and does nothing
// else - no database connection is even opened. With --apply it upserts on the tables' natural
// keys, so re-running yields the same row counts. It refuses a slug that already belongs to a real
// client (anything not carrying this script's marker in data.clients.notes).
//
// Everything below is made up: a fictional shop, customers with @example.com addresses, no phone
// numbers, no real URLs. Generators are pure and seeded; main() is the only impure part.
import { parseArgs } from 'node:util'
import { randomBytes } from 'node:crypto'
import { die, pgClient, serviceClient, isMain, runMain } from './_lib.js'

export const DEFAULT_SLUG = 'bcns-demo'
export const DEMO_NOTES = 'bcns demo tenant: invented sample data (seed-demo-tenant)'
export const DEMO_NAME = 'Juniper & Vale (demo)'
export const DEMO_TIMEZONE = 'America/New_York'
export const DAYS = 60
const SEED = 20261006

// ---------------------------------------------------------------- pure helpers
/** Small seeded PRNG (mulberry32): same seed, same sequence. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
const DAY_MS = 86_400_000
/** ISO timestamp `n` days before `base` plus `hour` hours. Hours 14-23 UTC stay on one New York calendar day. */
export const ts = (base: Date, n: number, hour = 0) => new Date(base.getTime() - n * DAY_MS + hour * 3_600_000).toISOString()
export const dayOf = (base: Date, n: number) => ts(base, n).slice(0, 10)

type Row = Record<string, unknown>
const FIRST = ['Avery', 'Blair', 'Casey', 'Devon', 'Emery', 'Finley', 'Gray', 'Harper', 'Indigo', 'Jules', 'Kai', 'Lane', 'Morgan', 'Nico', 'Oakley', 'Parker', 'Quinn', 'Reese', 'Sage', 'Tatum'] as const
const LAST = ['Alder', 'Birch', 'Cedar', 'Dunmore', 'Elmwood', 'Fairweather', 'Greer', 'Hollis', 'Ivers', 'Juniper', 'Kestrel', 'Larkin', 'Marlow', 'Northcott', 'Orchard', 'Pennington'] as const

// ---------------------------------------------------------------- generators
export function genProducts(base: Date): Row[] {
  const defs: [string, string, string, number, number][] = [
    ['Cedar & Smoke Candle', 'Candles', 'candle', 2800, 3],
    ['Fresh Linen Candle', 'Candles', 'candle', 2800, 3],
    ['Winter Pine Candle', 'Candles', 'candle', 3200, 3],
    ['Ceramic Wick Trimmer', 'Accessories', 'accessory', 1400, 1],
    ['Brass Candle Snuffer', 'Accessories', 'accessory', 1800, 1],
    ['Reed Diffuser Set', 'Home fragrance', 'diffuser', 3600, 2],
    ['Linen Room Spray', 'Home fragrance', 'spray', 2200, 1],
    ['Gift Set: Three Minis', 'Gift sets', 'gift', 4800, 1],
  ]
  return defs.map(([title, product_type, slug, price, variants], i) => ({
    source: 'shopify', external_id: `demo-product-${String(i + 1).padStart(2, '0')}`, title,
    handle: `${slug}-${i + 1}`, status: 'ACTIVE', vendor: 'Juniper & Vale', product_type,
    price_minor: price, currency: 'USD', inventory_quantity: 20 + ((i * 37) % 90), variants_count: variants,
    image_url: null, url: `https://example.com/demo/products/${slug}-${i + 1}`,
    attributes: { variants: Array.from({ length: variants }, (_, v) => ({ id: `demo-variant-${i + 1}-${v + 1}`, title: variants > 1 ? ['Small', 'Medium', 'Large'][v] : 'Default', price_minor: price + v * 600 })) },
    source_updated_at: ts(base, 1, 15),
  }))
}

export function genOrders(base: Date): { orders: Row[]; refunds: Row[]; payouts: Row[]; customers: Row[] } {
  const r = rng(SEED)
  const products = genProducts(base)
  const customers = Array.from({ length: 36 }, (_, i) => {
    const first = FIRST[i % FIRST.length], last = LAST[(i * 7 + 3) % LAST.length]
    return { first, last, i, orders: 0, spent: 0, firstAt: '' }
  })
  const orders: Row[] = [], refunds: Row[] = [], payouts: Row[] = []
  let seq = 0, week = 0
  for (let d = DAYS; d >= 1; d--) {
    for (let k = 0, n = int(r, 2, 7); k < n; k++) {
      seq++
      const cust = customers[int(r, 0, customers.length - 1)]
      const lines = Array.from({ length: int(r, 1, 3) }, () => {
        const p = pick(r, products), quantity = int(r, 1, 2)
        return { id: `demo-line-${seq}-${p.external_id}`, title: p.title, sku: String(p.handle), quantity, total_minor: (p.price_minor as number) * quantity }
      })
      const total = lines.reduce((s, l) => s + l.total_minor, 0)
      const at = ts(base, d, int(r, 14, 23))
      const refunded = r() < 0.05
      const ext = `demo-order-${String(seq).padStart(4, '0')}`
      orders.push({
        source: 'shopify', external_id: ext, kind: 'order', occurred_at: at, day: at.slice(0, 10), amount_minor: total, currency: 'USD',
        status: refunded ? 'REFUNDED' : 'PAID', order_number: `#${1000 + seq}`, customer_external_id: `demo-customer-${String(cust.i + 1).padStart(3, '0')}`,
        items_count: lines.reduce((s, l) => s + l.quantity, 0), url: `https://example.com/demo/orders/${1000 + seq}`,
        attributes: { fulfillment_status: 'FULFILLED', line_items: lines }, source_updated_at: at,
      })
      cust.orders++; cust.spent += total; cust.firstAt ||= at
      if (refunded) refunds.push({
        source: 'shopify', external_id: `demo-refund-${String(seq).padStart(4, '0')}`, kind: 'refund', occurred_at: ts(base, d - 1 || 1, 15),
        day: ts(base, d - 1 || 1, 15).slice(0, 10), amount_minor: -total, currency: 'USD', status: null, order_number: `#${1000 + seq}`,
        attributes: { order_external_id: ext }, source_updated_at: at,
      })
    }
    if (d % 7 === 0) {
      week++
      const gross = orders.filter((o) => (o.occurred_at as string) >= ts(base, d + 7) && (o.occurred_at as string) < ts(base, d)).reduce((s, o) => s + (o.amount_minor as number), 0)
      payouts.push({
        source: 'shopify', external_id: `demo-payout-${String(week).padStart(2, '0')}`, kind: 'payout', occurred_at: ts(base, d, 12), day: dayOf(base, d),
        amount_minor: Math.round(gross * 0.97), currency: 'USD', status: 'PAID', attributes: { transaction_type: 'payout', summary: 'Weekly payout' }, source_updated_at: ts(base, d, 12),
      })
    }
  }
  const customerRows = customers.filter((c) => c.orders > 0).map((c) => ({
    source: 'shopify', external_id: `demo-customer-${String(c.i + 1).padStart(3, '0')}`, email: `${c.first}.${c.last}${c.i + 1}@example.com`.toLowerCase(),
    name: `${c.first} ${c.last}`, first_order_at: c.firstAt, orders_count: c.orders, total_spent_minor: c.spent, currency: 'USD', attributes: {}, source_updated_at: ts(base, 1, 15),
  }))
  return { orders, refunds, payouts, customers: customerRows }
}

const CAMPAIGNS = [
  { id: 'demo-campaign-01', name: 'Spring Candle Launch', objective: 'OUTCOME_SALES', status: 'ACTIVE', spend: 3200 },
  { id: 'demo-campaign-02', name: 'Gift Sets Retargeting', objective: 'OUTCOME_SALES', status: 'ACTIVE', spend: 1800 },
  { id: 'demo-campaign-03', name: 'Newsletter Signups', objective: 'OUTCOME_LEADS', status: 'PAUSED', spend: 900 },
] as const

export function genDailyMetrics(base: Date, orders: Row[]): Row[] {
  const r = rng(SEED + 1)
  const out: Row[] = []
  const perDay = new Map<string, number>()
  for (const o of orders) perDay.set(o.day as string, (perDay.get(o.day as string) ?? 0) + 1)
  const m = (source: string, day: string, entity_kind: string, entity_id: string, metric: string, value: number, currency: string | null = null) =>
    out.push({ source, day, entity_kind, entity_id, metric, value, currency })
  let inventory = 640
  for (let d = DAYS; d >= 1; d--) {
    const day = dayOf(base, d), n = perDay.get(day) ?? 0
    const sessions = Math.max(n, Math.round(n / (0.018 + r() * 0.017)))
    inventory = d % 21 === 0 ? inventory + 300 : Math.max(120, inventory - int(r, 5, 18))
    m('shopify', day, 'store', 'store', 'sessions', sessions)
    m('shopify', day, 'store', 'store', 'conversion_rate', sessions ? Math.round((n / sessions) * 10000) / 10000 : 0)
    m('shopify', day, 'store', 'store', 'inventory_units', inventory)
    for (const c of CAMPAIGNS) {
      if (c.status === 'PAUSED' && d < 30) continue
      const spend = Math.round(c.spend * (0.7 + r() * 0.6)), impressions = int(r, 3000, 9000), clicks = int(r, 60, 240), purchases = int(r, 0, 6)
      m('meta', day, 'campaign', c.id, 'spend', spend, 'USD')
      m('meta', day, 'campaign', c.id, 'impressions', impressions)
      m('meta', day, 'campaign', c.id, 'clicks', clicks)
      m('meta', day, 'campaign', c.id, 'reach', Math.round(impressions * 0.7))
      m('meta', day, 'campaign', c.id, 'purchases', purchases)
      m('meta', day, 'campaign', c.id, 'purchase_value', purchases * int(r, 2800, 5200), 'USD')
    }
  }
  return out
}

export function genJobs(base: Date): Row[] {
  const defs: [string, string, string, string, number][] = [
    ['Reorder cedar candle wax', 'Working on it', 'This week', 'Avery', 3],
    ['Photograph spring gift sets', 'Working on it', 'This week', 'Blair', 5],
    ['Update shipping rates for summer', 'Stuck', 'This week', 'Casey', 2],
    ['Reply to wholesale inquiry', 'Working on it', 'This week', 'Avery', 1],
    ['Plan holiday candle scents', 'Not started', 'Next up', 'Devon', 30],
    ['Set up monthly newsletter', 'Not started', 'Next up', 'Blair', 21],
    ['Audit product descriptions', 'Not started', 'Next up', 'Casey', 28],
    ['Book farmers market stall', 'Not started', 'Next up', 'Devon', 14],
    ['Switch to recycled shipping boxes', 'Done', 'Done', 'Avery', -12],
    ['Launch gift set bundle', 'Done', 'Done', 'Blair', -20],
    ['Fix checkout page typo', 'Done', 'Done', 'Casey', -25],
    ['Order new wick trimmers', 'Done', 'Done', 'Devon', -33],
  ]
  return defs.map(([title, status, group_name, owner, due], i) => ({
    source: 'monday', external_id: `demo-job-${String(i + 1).padStart(2, '0')}`, kind: 'task', title, status, is_done: status === 'Done',
    priority: i % 3 === 0 ? 'High' : 'Medium', group_name, owner, due_on: dayOf(base, -due), url: `https://example.com/demo/board/${i + 1}`,
    attributes: {}, source_updated_at: ts(base, 2, 15),
  }))
}

export function genMessages(base: Date): Row[] {
  const defs: [string, string, string[], number][] = [
    ['Weekly sync', 'Candle sales are up on weekends. Agreed to push the gift sets in the next newsletter. Casey will check shipping rates before the summer promotion.', ['Avery Alder', 'Blair Birch', 'Casey Cedar'], 4],
    ['Supplier call: wax and wicks', 'The supplier can deliver cedar wax in two weeks. We asked about a bulk discount for orders over fifty pounds and will decide after the next sales review.', ['Avery Alder', 'Devon Dunmore'], 11],
    ['Holiday planning', 'Brainstormed three holiday scents. Winter Pine stays. Goal is to photograph the new range by the end of next month.', ['Blair Birch', 'Devon Dunmore', 'Avery Alder'], 18],
    ['Wholesale inquiry follow-up', 'A local cafe wants twelve candles a month. We will quote a wholesale price of 40 percent off retail and confirm delivery dates.', ['Avery Alder', 'Casey Cedar'], 25],
    ['Ads review', 'Gift Sets Retargeting is paying for itself. Newsletter Signups is paused until the new landing page is ready.', ['Blair Birch', 'Casey Cedar'], 32],
    ['Returns and refunds check-in', 'Refunds are about five percent of orders, mostly damaged jars. Switching to recycled boxes with more padding should help.', ['Avery Alder', 'Devon Dunmore', 'Casey Cedar'], 41],
  ]
  return defs.map(([title, body, participants, d], i) => ({
    source: 'meet', external_id: `demo-meeting-${String(i + 1).padStart(2, '0')}`, kind: 'meeting_note', title, body,
    occurred_at: ts(base, d, 15), participants, url: `https://example.com/demo/notes/${i + 1}`, attributes: {}, source_updated_at: ts(base, d, 16),
  }))
}

export function genRecords(base: Date): Row[] {
  const campaigns = CAMPAIGNS.map((c, i) => ({
    source: 'meta', external_id: c.id, kind: 'campaign', title: c.name, body: null, occurred_at: ts(base, 60 - i * 5, 12),
    attributes: { effective_status: c.status, objective: c.objective }, source_updated_at: ts(base, 1, 12),
  }))
  const reviews = [
    ['Five stars', 'The cedar candle fills the whole room. Shipping was quick and the jar was packed well.'],
    ['Lovely gift', 'Bought the gift set for a friend and she loved all three scents.'],
    ['Good, but burns fast', 'Smells great. I wish the small size lasted a little longer.'],
    ['Will order again', 'Fresh Linen smells clean, not sweet. Already ordered a second one.'],
    ['Arrived damaged', 'The lid was cracked in the box. Support replaced it the same week.'],
    ['Great diffuser', 'The reed diffuser has lasted two months and still smells good.'],
  ].map(([title, body], i) => ({
    source: 'dashboard', external_id: `demo-review-${String(i + 1).padStart(2, '0')}`, kind: 'review', title, body,
    occurred_at: ts(base, 3 + i * 6, 16), attributes: { rating: [5, 5, 4, 5, 2, 5][i] }, source_updated_at: ts(base, 3 + i * 6, 16),
  }))
  return [...campaigns, ...reviews]
}

export interface Plan { tables: Record<string, Row[]> }

/** Every row the seed writes, keyed by data.* table. Pure: same base date, same plan. */
export function buildPlan(base: Date): Plan {
  const { orders, refunds, payouts, customers } = genOrders(base)
  return {
    tables: {
      money: [...orders, ...refunds, ...payouts], customers, products: genProducts(base),
      daily_metrics: genDailyMetrics(base, orders), jobs: genJobs(base), messages: genMessages(base), records: genRecords(base),
    },
  }
}

export const countsOf = (plan: Plan): Record<string, number> =>
  Object.fromEntries(Object.entries(plan.tables).map(([t, rows]) => [t, rows.length]))

// ---------------------------------------------------------------- SQL
// Natural keys; columns are listed so an upsert only ever touches what this script owns.
const KEYS: Record<string, string[]> = {
  money: ['client_id', 'source', 'external_id'], customers: ['client_id', 'source', 'external_id'],
  products: ['client_id', 'source', 'external_id'], jobs: ['client_id', 'source', 'external_id'],
  messages: ['client_id', 'source', 'external_id'], records: ['client_id', 'source', 'external_id'],
  daily_metrics: ['client_id', 'source', 'day', 'entity_kind', 'entity_id', 'metric'],
}

/** One statement per table: rows go in as one jsonb array, so the whole table is a single upsert. */
export function upsertSql(table: string, sample: Row): string {
  const cols = ['client_id', ...Object.keys(sample)]
  const key = KEYS[table]
  const update = cols.filter((c) => !key.includes(c)).map((c) => `${c} = excluded.${c}`).join(', ')
  return `insert into data.${table} (${cols.join(', ')}) select ${cols.join(', ')} from jsonb_populate_recordset(null::data.${table}, $1::jsonb) ` +
    `on conflict (${key.join(', ')}) do update set ${update}`
}

// ---------------------------------------------------------------- main
export interface Conn { query(sql: string, params?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>; release(): void }
export interface Admin {
  createUser(a: { email: string; password: string; email_confirm: boolean }): Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>
  updateUserById(id: string, a: { password: string }): Promise<{ error: { message: string } | null }>
}
export interface SeedDeps { connect?: () => Promise<Conn>; admin?: Admin; today?: Date; log?: (line: string) => void }

export const reviewerEmail = (slug: string) => `reviewer+${slug}@bcn-services.com`

export async function main(argv: string[], deps: SeedDeps = {}): Promise<void> {
  const { values } = parseArgs({ args: argv, options: {
    slug: { type: 'string' }, 'base-date': { type: 'string' }, 'reset-password': { type: 'boolean' }, apply: { type: 'boolean' } } })
  const slug = values.slug ?? DEFAULT_SLUG
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) die(`bad slug: ${slug}`)
  const baseArg = values['base-date']
  if (baseArg !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(baseArg)) die('usage: --base-date YYYY-MM-DD')
  const base = new Date(`${baseArg ?? (deps.today ?? new Date()).toISOString().slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(base.getTime())) die(`bad --base-date: ${baseArg}`)
  const log = deps.log ?? console.log

  const plan = buildPlan(base)
  log(`demo tenant plan for slug ${slug} (${DEMO_NAME}), base date ${base.toISOString().slice(0, 10)}, last ${DAYS} days:`)
  log('  data.clients: 1 (upsert by slug) + reviewer login')
  for (const [t, n] of Object.entries(countsOf(plan))) log(`  data.${t}: ${n}`)
  log('  data.ai_settings: 1 (customer contact sharing on; every address is @example.com)')
  // The guard. Nothing below this line runs without --apply, and nothing above it writes.
  if (!values.apply) {
    log('dry run: nothing written. Re-run with --apply to write.')
    return
  }

  const pool = deps.connect ? null : pgClient()
  const connect = deps.connect ?? (() => pool!.connect() as unknown as Promise<Conn>) // pg's PoolClient has this exact shape
  try {
    const db = await connect()
    let clientId: string
    try {
      await db.query('begin')
      await db.query('insert into data.clients (slug, name, timezone, notes) values ($1, $2, $3, $4) on conflict (slug) do nothing',
        [slug, DEMO_NAME, DEMO_TIMEZONE, DEMO_NOTES])
      const c = await db.query('select id, notes from data.clients where slug = $1', [slug])
      if (c.rows[0]?.notes !== DEMO_NOTES) die(`slug ${slug} belongs to a real client, not a demo tenant; refusing to write`)
      clientId = c.rows[0].id as string // select id: always a uuid string
      for (const [table, rows] of Object.entries(plan.tables)) {
        await db.query(upsertSql(table, rows[0]), [JSON.stringify(rows.map((row) => ({ client_id: clientId, ...row })))])
      }
      await db.query('insert into data.ai_settings (client_id, share_customer_contact) values ($1, true) on conflict (client_id) do update set share_customer_contact = true', [clientId])
      await db.query('commit')
    } catch (e) {
      await db.query('rollback').catch(() => {})
      throw e
    } finally {
      db.release()
    }

    // Reviewer login, the way onboard creates its smoke user. Password is printed once, never stored.
    const email = reviewerEmail(slug)
    const admin = deps.admin ?? (serviceClient().auth.admin as unknown as Admin) // the two calls used below
    const db2 = await connect()
    try {
      const existing = await db2.query('select id from auth.users where email = $1', [email])
      let userId = existing.rows[0]?.id as string | undefined // select id: uuid string
      let password: string | undefined
      if (!userId) {
        password = randomBytes(18).toString('base64url')
        const { data, error } = await admin.createUser({ email, password, email_confirm: true })
        if (error || !data.user) die(`create reviewer user: ${error?.message}`)
        userId = data.user.id
      } else if (values['reset-password']) {
        password = randomBytes(18).toString('base64url')
        const { error } = await admin.updateUserById(userId, { password })
        if (error) die(`reset reviewer password: ${error.message}`)
      }
      await db2.query(`insert into data.memberships (user_id, client_id, role, is_smoke) values ($1, $2, 'member', false)
        on conflict (user_id) do update set client_id = excluded.client_id`, [userId, clientId])
      log(`seeded ${slug} (${clientId})`)
      log(`reviewer login: ${email}`)
      log(password ? `reviewer password (save now, shown once): ${password}` : 'reviewer password: unchanged (re-run with --reset-password to issue a new one)')
    } finally {
      db2.release()
    }
  } finally {
    await pool?.end()
  }
}

if (isMain(import.meta.url)) runMain(main)
