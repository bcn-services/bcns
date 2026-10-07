// Item 8, hub source settings (migration 20261007000400): an owner reads status, target and runs,
// re-syncs (the add-source --reset-cursors update, once an hour, never under a lease) and repoints
// a meet/drive folder. Every fixture client is synthetic, so the shared acme/beta/gamma seed is
// untouched. Needs the local stack (supabase start in platform/) with migrations applied.
import { afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { clientWithToken, mintJwt, pool, serviceClient, sql } from './helpers.js'

const made: string[] = []
const users: string[] = []
const TARGET_KEYS = ['folder_id', 'notes_url', 'board_url', 'board_id', 'admin_url', 'shop', 'realm_id']
const FOLDER = '1AbC_dEf-GhIjKlMnOp'

async function mkClient(): Promise<string> {
  const id = randomUUID()
  made.push(id)
  await sql(`insert into data.clients (id, slug, name, timezone) values ($1, $2, 'Source Settings', 'America/New_York')`, [id, `ss-${id.slice(0, 8)}`])
  return id
}

async function mkUser(client: string, role: 'owner' | 'member'): Promise<string> {
  const { data, error } = await serviceClient().auth.admin.createUser({
    email: `ss-${randomUUID().slice(0, 8)}@example.test`, password: 'password-ss', email_confirm: true })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  users.push(data.user.id)
  await sql(`insert into data.memberships (user_id, client_id, role) values ($1, $2, $3)`, [data.user.id, client, role])
  return mintJwt(data.user.id, { client_id: client })
}

/** A schedule row with cursors mid-flight, so a reset is visible. `leased`: a worker holds it; `resetNow`: re-synced just now. */
async function schedule(client: string, source: string, config: Record<string, unknown>,
  opts: { leased?: boolean; resetNow?: boolean } = {}) {
  await sql(`insert into data.connector_schedule (client_id, source, interval, backfill_from, config, backfill_cursor,
               incremental_cursor, next_run_at, lease_until, last_reset_at)
             values ($1, $2, '1 hour', current_date - 7, $3::jsonb, null, '{"since":"2026-01-01"}'::jsonb, now() + interval '1 day',
               case when $4 then now() + interval '5 minutes' end, case when $5 then now() end)`,
    [client, source, JSON.stringify(config), opts.leased === true, opts.resetNow === true])
}

const row = async (client: string, source: string) =>
  (await sql(`select backfill_cursor, incremental_cursor, next_run_at <= now() due, last_reset_at, folder_changed_at, config
              from data.connector_schedule where client_id = $1 and source = $2`, [client, source])).rows[0]

afterAll(async () => {
  for (const u of users) await serviceClient().auth.admin.deleteUser(u)
  if (made.length) {
    for (const t of ['connector_runs', 'connector_schedule']) await sql(`delete from data.${t} where client_id = any($1::uuid[])`, [made])
    await sql(`delete from data.clients where id = any($1::uuid[])`, [made])
  }
  await pool.end()
})

describe('api.source_settings_v1 / api.connector_runs_v1', () => {
  it('target is an allow-list subset even when config holds oauth_client_id and an unknown key', async () => {
    const client = await mkClient()
    await schedule(client, 'meet', { folder_id: FOLDER, notes_url: 'https://drive.google.com/x', oauth_client_id: 'cid-123', surprise: 1 })
    const { data, error } = await clientWithToken(await mkUser(client, 'member')).rpc('source_settings_v1')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    const target = data[0].target as Record<string, unknown>
    expect(Object.keys(target).every((k) => TARGET_KEYS.includes(k))).toBe(true)
    expect(target).toEqual({ folder_id: FOLDER, notes_url: 'https://drive.google.com/x' })
    expect(JSON.stringify(data)).not.toContain('cid-123')
    expect(Object.keys(data[0])).not.toContain('client_id')
  })

  it('runs: the last 20 for that source, newest first, no lease_owner', async () => {
    const client = await mkClient()
    await schedule(client, 'drive', { folder_id: FOLDER })
    await sql(`insert into data.connector_runs (client_id, source, mode, status, started_at, finished_at, rows_fetched, lease_owner)
               select $1, 'drive', 'incremental', 'ok', now() - make_interval(mins => g), now(), g, 'worker-x'
               from generate_series(1, 25) g`, [client])
    const { data, error } = await clientWithToken(await mkUser(client, 'member')).rpc('connector_runs_v1', { p_source: 'drive' })
    expect(error).toBeNull()
    expect(data).toHaveLength(20)
    expect(data[0].rows_fetched).toBe(1)
    expect(Object.keys(data[0])).not.toContain('lease_owner')
  })

  it('an owner of tenant A cannot see or reset tenant B', async () => {
    const a = await mkClient()
    const b = await mkClient()
    await schedule(b, 'monday', { board_id: '9' })
    await sql(`insert into data.connector_runs (client_id, source, mode, status) values ($1, 'monday', 'backfill', 'ok')`, [b])
    const ownerA = clientWithToken(await mkUser(a, 'owner'))
    expect((await ownerA.rpc('source_settings_v1')).data).toEqual([])
    expect((await ownerA.rpc('connector_runs_v1', { p_source: 'monday' })).data).toEqual([])
    const { error } = await ownerA.rpc('reset_source_cursors', { p_source: 'monday' })
    expect(error?.code).toBe('BCNS4')
    expect((await row(b, 'monday')).last_reset_at).toBeNull()
  })
})

describe('api.reset_source_cursors', () => {
  it('an owner resets exactly the cursors and next_run_at, then is held to one per hour', async () => {
    const client = await mkClient()
    await schedule(client, 'monday', { board_id: '9' })
    const owner = clientWithToken(await mkUser(client, 'owner'))
    expect((await owner.rpc('reset_source_cursors', { p_source: 'monday' })).error).toBeNull()
    const after = await row(client, 'monday')
    expect(after.backfill_cursor).toEqual({})
    expect(after.incremental_cursor).toEqual({})
    expect(after.due).toBe(true)
    expect(after.last_reset_at).not.toBeNull()
    const again = await owner.rpc('reset_source_cursors', { p_source: 'monday' })
    expect(again.error?.code).toBe('BCNS9')
    expect(again.error?.message).toBe('rate_limited')
  })

  it('a member is refused with BCNS2 and nothing changes', async () => {
    const client = await mkClient()
    await schedule(client, 'monday', { board_id: '9' })
    const { error } = await clientWithToken(await mkUser(client, 'member')).rpc('reset_source_cursors', { p_source: 'monday' })
    expect(error?.code).toBe('BCNS2')
    expect((await row(client, 'monday')).incremental_cursor).toEqual({ since: '2026-01-01' })
  })

  it('is refused while a sync holds the lease', async () => {
    const client = await mkClient()
    await schedule(client, 'monday', { board_id: '9' }, { leased: true })
    const { error } = await clientWithToken(await mkUser(client, 'owner')).rpc('reset_source_cursors', { p_source: 'monday' })
    expect(error?.code).toBe('BCNS9')
    expect(error?.message).toBe('sync_running')
    expect((await row(client, 'monday')).last_reset_at).toBeNull()
  })

  it('shopify is refused', async () => {
    const client = await mkClient()
    await schedule(client, 'shopify', { shop: 'ss.myshopify.com' })
    const { error } = await clientWithToken(await mkUser(client, 'owner')).rpc('reset_source_cursors', { p_source: 'shopify' })
    expect(error?.code).toBe('BCNS3')
  })
})

describe('api.set_source_folder', () => {
  it('writes folder_id + notes_url and resets the cursors, even inside the hour', async () => {
    const client = await mkClient()
    await schedule(client, 'drive', { folder_id: 'old-folder-id', oauth_client_id: 'cid-123' }, { resetNow: true })
    const { error } = await clientWithToken(await mkUser(client, 'owner'))
      .rpc('set_source_folder', { p_source: 'drive', p_folder_id: FOLDER, p_folder_url: null })
    expect(error).toBeNull()
    const after = await row(client, 'drive')
    expect(after.config).toEqual({
      folder_id: FOLDER, notes_url: `https://drive.google.com/drive/folders/${FOLDER}`, oauth_client_id: 'cid-123' })
    expect(after.backfill_cursor).toEqual({})
    expect(after.incremental_cursor).toEqual({})
    expect(after.due).toBe(true)
    expect(after.folder_changed_at).not.toBeNull()
  })

  it('shopify and monday are refused, and a bad id or non-drive link fails validation', async () => {
    const client = await mkClient()
    await schedule(client, 'meet', { folder_id: FOLDER })
    const owner = clientWithToken(await mkUser(client, 'owner'))
    for (const source of ['shopify', 'monday']) {
      const { error } = await owner.rpc('set_source_folder', { p_source: source, p_folder_id: FOLDER, p_folder_url: null })
      expect(error?.code, source).toBe('BCNS3')
      expect(error?.details, source).toBe('source')
    }
    const badId = await owner.rpc('set_source_folder', { p_source: 'meet', p_folder_id: "x' or '1'='1", p_folder_url: null })
    expect(badId.error?.details).toBe('folder_id')
    const badUrl = await owner.rpc('set_source_folder', { p_source: 'meet', p_folder_id: FOLDER, p_folder_url: 'https://evil.example/x' })
    expect(badUrl.error?.details).toBe('folder_url')
    expect((await row(client, 'meet')).config).toEqual({ folder_id: FOLDER })
  })

  it('a member is refused with BCNS2', async () => {
    const client = await mkClient()
    await schedule(client, 'meet', { folder_id: FOLDER })
    const { error } = await clientWithToken(await mkUser(client, 'member'))
      .rpc('set_source_folder', { p_source: 'meet', p_folder_id: FOLDER, p_folder_url: null })
    expect(error?.code).toBe('BCNS2')
  })
})
