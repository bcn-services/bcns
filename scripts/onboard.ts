// onboard --slug --name --timezone [--sources shopify,meta,monday,meet]  (DESIGN.md §5.10, §9)
//
// NOTES (design silent / no live network in this environment):
// - Connector defaults (interval, backfill_depth) aren't in code yet (no worker/src/connectors/*
//   exists). Uses the values seed.sql already assumes: shopify/monday 15m, meta/meet 1h, 90d backfill.
// - §9's live checklist (Shopify shop probe, Meta /debug_token, Google Internal-app check, Monday
//   column autodetect) needs real per-source network access this local script can't make. --sources
//   prompts for and stores the secret + writes connector_schedule defaults; it does not verify them.
//   Needs Nate: decide whether/when to add the live verification calls.
// - Smoke password has no password-manager integration here; printed once to stdout instead.
import { parseArgs } from 'node:util'
import { randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { die, pgClient, serviceClient, isMain, runMain } from './_lib.js'

const SOURCES = ['shopify', 'meta', 'monday', 'meet'] as const
type Source = (typeof SOURCES)[number]
const TOKEN_KIND: Record<Source, string> = {
  shopify: 'shopify_admin',
  meta: 'meta_system_user',
  monday: 'monday_personal',
  meet: 'google_oauth_refresh',
}
// seed.sql's own intervals/backfill window, pending real connector-code defaults (see NOTES above).
const DEFAULT_INTERVAL: Record<Source, string> = {
  shopify: '15 minutes',
  monday: '15 minutes',
  meta: '1 hour',
  meet: '1 hour',
}
const DEFAULT_BACKFILL_DAYS = 90

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      slug: { type: 'string' },
      name: { type: 'string' },
      timezone: { type: 'string' },
      sources: { type: 'string' },
    },
  })
  const { slug, name, timezone } = values
  if (!slug || !name || !timezone) die('usage: onboard --slug <slug> --name <name> --timezone <tz> [--sources shopify,meta,monday,meet]')
  const sources = (values.sources ?? '').split(',').map((s) => s.trim()).filter(Boolean) as Source[]
  for (const s of sources) if (!SOURCES.includes(s)) die(`unknown source: ${s}`)

  const db = pgClient()
  try {
    const client = await db.query<{ id: string }>(
      'insert into data.clients (slug, name, timezone) values ($1, $2, $3) returning id',
      [slug, name, timezone],
    )
    const clientId = client.rows[0].id

    const email = `smoke+${slug}@bcn-services.com`
    const password = randomBytes(18).toString('base64url')
    const admin = serviceClient()
    const { data: user, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (error || !user.user) die(`create smoke user: ${error?.message}`)
    await db.query('insert into data.memberships (user_id, client_id, role, is_smoke) values ($1, $2, $3, true)', [
      user.user.id,
      clientId,
      'member',
    ])

    if (sources.length) {
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      try {
        for (const source of sources) {
          const secret = await rl.question(`${source} credential (${TOKEN_KIND[source]}): `)
          await db.query(
            `insert into data.source_tokens (client_id, source, kind, secret) values ($1, $2, $3, $4)
             on conflict (client_id, source) do update set secret = excluded.secret, kind = excluded.kind`,
            [clientId, source, TOKEN_KIND[source], secret],
          )
          await db.query(
            `insert into data.connector_schedule (client_id, source, interval, backfill_from, backfill_cursor, next_run_at)
             values ($1, $2, $3::interval, current_date - $4::int, '{}'::jsonb, now())
             on conflict (client_id, source) do nothing`,
            [clientId, source, DEFAULT_INTERVAL[source], DEFAULT_BACKFILL_DAYS],
          )
        }
      } finally {
        rl.close()
      }
    }

    console.log(`onboarded ${slug} (${clientId})`)
    console.log(`smoke user: ${email}`)
    console.log(`smoke password (save now, shown once): ${password}`)
  } finally {
    await db.end()
  }
}

if (isMain(import.meta.url)) runMain(main)
