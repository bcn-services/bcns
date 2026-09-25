// onboard --slug --name --timezone [--sources meta,monday,meet,drive]  (DESIGN.md §5.10, §9)
// shopify is NOT attachable here — see shopifyRefusal() below.
// Inserts the client + smoke user, then per source: prompts for credentials, runs the §9 checklist
// (a failed item stops the script), writes source_tokens and connector_schedule from the connector's
// own defaults. Smoke password is printed once (no password-manager integration in this build).
import { parseArgs } from 'node:util'
import { randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { connectors, type Source } from '../worker/src/connectors/index.js'
import { checklist, type Creds } from './checklist.js'
import { die, pgClient, serviceClient, isMain, runMain } from './_lib.js'

// What the operator is asked for, per source (§4.2–§4.6 config + token shapes).
const PROMPTS: Record<Source, { config: string[]; secret: string; refresh?: string; attribute?: string }> = {
  // Unreachable: attachSource refuses shopify (and quickbooks) before it prompts. Kept so
  // the Record stays total over Source, and so the config field names stay next to the others.
  shopify: { config: ['shop', 'admin_url'], secret: 'Admin API token' },
  meta: { config: ['act_id', 'ads_manager_url'], secret: 'system user token' },
  monday: { config: ['board_id', 'board_url'], secret: 'personal token' },
  meet: { config: ['folder_id', 'oauth_client_id', 'notes_url'], secret: 'access token (blank to mint from refresh)', refresh: 'refresh token', attribute: 'oauth_client_secret' },
  drive: { config: ['folder_id', 'oauth_client_id'], secret: 'access token (blank to mint from refresh)', refresh: 'refresh token', attribute: 'oauth_client_secret' },
  quickbooks: { config: ['realm_id'], secret: 'access token' },
}

/**
 * Shopify is connected in a browser, never here.
 *
 * Its Admin token expires in an hour and only a refresh token renews it, and both
 * only ever come out of an OAuth round-trip — there is no value an operator can be
 * handed to paste that survives the afternoon. (Non-expiring tokens are not a way
 * out: the Admin API answers those 403 since 2026-09-19.) So the CLI refuses and
 * points at the same self-serve flow the hub runs. Google's path is unaffected —
 * its refresh token IS hand-pasteable and long-lived.
 */
const HUB_BASE_URL = (process.env.HUB_BASE_URL ?? 'https://connect.bcn-services.com').replace(/\/+$/, '')
export function shopifyRefusal(): string {
  return [
    'shopify is connected in the browser, not here: its Admin token expires in an hour and only',
    'an OAuth round-trip produces the refresh token that renews it.',
    `  1. have the client's OWNER sign in at ${HUB_BASE_URL}/ and click Connect on the Shopify card`,
    `  2. or go straight there: ${HUB_BASE_URL}/api/oauth/shopify/start?shop=<store>.myshopify.com`,
    'The callback writes the same rows this script would, through data.attach_source.',
  ].join('\n')
}

/** Same rationale as shopifyRefusal(): a 60-minute access token and a rotating 100-day refresh token only ever come out of an OAuth round-trip. */
export function quickbooksRefusal(): string {
  return [
    'quickbooks is connected in the browser, not here: its access token expires in an hour and only',
    'an OAuth round-trip produces the refresh token that renews it.',
    `  have the client's OWNER sign in at ${HUB_BASE_URL}/ and click Connect on the QuickBooks card`,
    'The callback writes the same rows this script would, through api.connect_source.',
  ].join('\n')
}

export function backfillFrom(depth: string): string {
  if (depth === 'unbounded') return `'1970-01-01'::date`
  return `(current_date - interval '${depth === '0' ? '0 days' : depth}')::date`
}

export async function main(argv: string[], ask?: (q: string) => Promise<string>): Promise<void> {
  const { values } = parseArgs({ args: argv, options: {
    slug: { type: 'string' }, name: { type: 'string' }, timezone: { type: 'string' }, sources: { type: 'string' } } })
  const { slug, name, timezone } = values
  if (!slug || !name || !timezone) die('usage: onboard --slug <slug> --name <name> --timezone <tz> [--sources meta,monday,meet,drive]')
  const sources = (values.sources ?? '').split(',').map((s) => s.trim()).filter(Boolean) as Source[]
  // Both checks before the client row is inserted: a refusal half way through the
  // attach loop would leave an orphan client behind.
  for (const s of sources) if (!(s in connectors)) die(`unknown source: ${s}`)
  if (sources.includes('shopify')) die(shopifyRefusal())
  if (sources.includes('quickbooks')) die(quickbooksRefusal())

  const db = pgClient()
  const rl = ask ? null : createInterface({ input: process.stdin, output: process.stdout })
  const question = ask ?? ((q: string) => rl!.question(q))
  try {
    const client = await db.query<{ id: string }>('insert into data.clients (slug, name, timezone) values ($1, $2, $3) returning id', [slug, name, timezone])
    const clientId = client.rows[0].id

    // U1
    const email = `smoke+${slug}@bcn-services.com`
    const password = randomBytes(18).toString('base64url')
    const admin = serviceClient()
    const { data: user, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error || !user.user) die(`create smoke user: ${error?.message}`)
    await db.query('insert into data.memberships (user_id, client_id, role, is_smoke) values ($1, $2, $3, true)', [user.user.id, clientId, 'member'])

    for (const source of sources) await attachSource(db, clientId, timezone, source, question)

    console.log(`onboarded ${slug} (${clientId})`)
    console.log(`smoke user: ${email}`)
    console.log(`smoke password (save now, shown once): ${password}`)
  } finally {
    rl?.close()
    await db.end()
  }
}

// One source: prompt, run the §9 checklist (throws before any write), upsert source_tokens + connector_schedule.
// Shared with add-source. Re-running rotates the token and resets its status; the schedule keeps its cursor.
export async function attachSource(db: ReturnType<typeof pgClient>, clientId: string, timezone: string, source: Source,
  question: (q: string) => Promise<string>): Promise<void> {
  // The one guard both CLI entry points route through, so add-source refuses too.
  if (source === 'shopify') die(shopifyRefusal())
  if (source === 'quickbooks') die(quickbooksRefusal())
  const p = PROMPTS[source]
  const creds: Creds = { secret: '', config: {} }
  for (const k of p.config) creds.config[k] = await question(`${source} ${k}: `)
  creds.secret = await question(`${source} ${p.secret}: `)
  if (p.refresh) creds.refresh_secret = await question(`${source} ${p.refresh}: `)
  if (p.attribute) creds.attributes = { [p.attribute]: await question(`${source} ${p.attribute}: `) }
  const { config, warnings } = await checklist(source, timezone, creds)
  for (const w of warnings) console.warn(`warning ${w}`)
  const { access_token, expires_in, ...cfg } = config
  const conn = connectors[source]
  // One upsert path, shared with api.connect_source (the self-serve OAuth callback in
  // apps/connect) via 20260918000100_attach_source_rpc.sql. The SQL used to be inline here;
  // it moved into data.attach_source so the CLI and the browser flow cannot drift apart.
  await db.query(
    `select data.attach_source($1, $2, $3, $4, $5, $6, $7, $8, $9::interval, ${backfillFrom(conn.defaults.backfillDepth)})`,
    [clientId, source, conn.tokenKind, (access_token as string) || creds.secret, creds.refresh_secret ?? null,
     access_token ? new Date(Date.now() + Number(expires_in) * 1000) : null, creds.attributes ?? {},
     { ...creds.config, ...cfg }, conn.defaults.interval])
}

if (isMain(import.meta.url)) runMain(main)
