// SB tuning (20261023162900): source_commands queue + executor, home_layout, branding, jobs.position. Needs the local stack.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { CLIENTS, USERS, anonClient, clientWithToken, localKeys, mintJwt, pool, serviceClient, signIn, sql, SUPABASE_URL } from './helpers.js'

// A signed-in user with no membership can't get a session (the access-token hook refuses), so mint the JWT.
const nobodyClient = async () => clientWithToken(await mintJwt(USERS.nobody.id))
import { closePool, type Tick } from '../worker/src/db.js'
import { sourceCommands } from '../worker/src/commands.js'

afterAll(async () => { await closePool(); await pool.end() })

const made: string[] = []
const mkTick = (fetch: typeof globalThis.fetch): Tick => ({
  taskIndex: 0, taskCount: 1, owner: 'sb-tune-test', fetch, stubbed: true, now: () => new Date(), log: () => {}, budgetMs: 60_000, claimLimit: 24,
})

beforeAll(() => {
  process.env.SUPABASE_URL = SUPABASE_URL
  process.env.SUPABASE_SERVICE_ROLE_KEY = localKeys().service
})
afterAll(async () => {
  await sql(`delete from data.source_commands where client_id = any($1::uuid[])`, [[CLIENTS.acme, CLIENTS.beta, ...made]])
  await sql(`update data.clients set home_layout = null where id = $1`, [CLIENTS.acme])
  if (made.length) await sql(`delete from data.jobs where client_id = any($1::uuid[])`, [made])
  if (made.length) await sql(`delete from data.clients where id = any($1::uuid[])`, [made])
})

describe('source_commands: enqueue + RLS', () => {
  it('a member/owner enqueues and reads their own; created_by is the caller; a non-member is refused', async () => {
    for (const u of [USERS.acmeMember, USERS.acmeOwner]) {
      const { client } = await signIn(u)
      const { data: id, error } = await client.rpc('enqueue_source_command', { p_source: 'monday', p_kind: 'set_status_done', p_payload: { item_id: '123' } })
      expect(error).toBeNull()
      const { data } = await client.from('source_commands_v1').select('*').eq('id', id)
      expect(data).toEqual([expect.objectContaining({ id, client_id: CLIENTS.acme, source: 'monday', kind: 'set_status_done', status: 'queued', payload: { item_id: '123' }, result: null, done_at: null })])
      expect((await sql(`select created_by from data.source_commands where id = $1`, [id])).rows[0].created_by).toBe(u.id)
    }
    const nobody = await nobodyClient()
    const r = await nobody.rpc('enqueue_source_command', { p_source: 'monday', p_kind: 'set_status_done', p_payload: {} })
    expect(r.error?.code).toBe('BCNS0')
    expect((await nobody.from('source_commands_v1').select('id')).data ?? []).toEqual([])
  })

  it('another tenant sees none of it; enqueue only for the caller\'s own connected sources; shape is validated', async () => {
    const beta = (await signIn(USERS.betaMember)).client
    expect((await beta.from('source_commands_v1').select('id')).data).toEqual([])
    const bad = (args: Record<string, unknown>) => beta.rpc('enqueue_source_command', { p_source: 'monday', p_kind: 'set_status_done', p_payload: {}, ...args }).then(r => r.error?.code)
    expect(await bad({ p_kind: 'Bad Kind' })).toBe('BCNS3')
    expect(await bad({ p_payload: [] })).toBe('BCNS3')
    expect(await bad({ p_payload: { x: 'y'.repeat(5000) } })).toBe('BCNS3')
    expect(await bad({ p_source: 'drive' })).toBe('BCNS4') // beta has no drive schedule
    // The row it did queue for itself is beta's, never acme's.
    const ok = await beta.rpc('enqueue_source_command', { p_source: 'monday', p_kind: 'set_status_done', p_payload: {} })
    expect(ok.error).toBeNull()
    expect((await sql(`select client_id from data.source_commands where id = $1`, [ok.data])).rows[0].client_id).toBe(CLIENTS.beta)
  })

  it('authenticated has no direct insert/update/delete on the table or the view; anon cannot call the RPC', async () => {
    const { client } = await signIn(USERS.acmeOwner)
    const ins = await client.schema('data' as never).from('source_commands').insert({ client_id: CLIENTS.acme, source: 'monday', kind: 'x' })
    expect(ins.error).not.toBeNull()
    const grants = (await sql(`select privilege_type from information_schema.role_table_grants where table_schema='data' and table_name='source_commands' and grantee='authenticated'`)).rows.map(r => r.privilege_type)
    expect(grants).toEqual(['SELECT'])
    const viewGrants = (await sql(`select privilege_type from information_schema.role_table_grants where table_schema='api' and table_name='source_commands_v1' and grantee='authenticated'`)).rows.map(r => r.privilege_type)
    expect(viewGrants).toEqual(['SELECT'])
    const anon = await anonClient().rpc('enqueue_source_command', { p_source: 'monday', p_kind: 'set_status_done', p_payload: {} })
    expect(anon.error).not.toBeNull()
  })
})

describe('source_commands: worker executor', () => {
  async function fixture(config: unknown = { board_id: '1001', columns: { status: 'color_x' } }) {
    const id = randomUUID(); made.push(id)
    await sql(`insert into data.clients (id, slug, name) values ($1, $2, 'Cmd Fixture')`, [id, `cmd-${id.slice(0, 8)}`])
    await sql(`insert into data.connector_schedule (client_id, source, interval, backfill_from, config, next_run_at)
               values ($1, 'monday', '1 hour', current_date - 7, $2::jsonb, now() + interval '1 day')`, [id, JSON.stringify(config)])
    await sql(`insert into data.source_tokens (client_id, source, kind, secret) values ($1, 'monday', 'monday_personal', 'tok-fixture')`, [id])
    return id
  }
  const queue = async (client: string, source: string, kind: string, payload: unknown) =>
    (await sql(`insert into data.source_commands (client_id, source, kind, payload) values ($1, $2, $3, $4::jsonb) returning id`, [client, source, kind, JSON.stringify(payload)])).rows[0].id as string
  const row = async (id: string) => (await sql(`select status, result, done_at from data.source_commands where id = $1`, [id])).rows[0]
  const nextRun = async (client: string) => (await sql(`select next_run_at <= now() as due from data.connector_schedule where client_id = $1 and source = 'monday'`, [client])).rows[0].due as boolean

  beforeAll(async () => { await sql(`delete from data.source_commands`) })

  it('set_status_done: sends the mutation with the stored token, marks done, makes monday due now', async () => {
    const client = await fixture()
    const id = await queue(client, 'monday', 'set_status_done', { item_id: '777' })
    const seen: { auth: string; body: any }[] = []
    const fetch = (async (_u: unknown, init: any) => {
      seen.push({ auth: init.headers.Authorization, body: JSON.parse(init.body) })
      return new Response(JSON.stringify({ data: { change_simple_column_value: { id: '777' } } }))
    }) as unknown as typeof globalThis.fetch
    expect(await nextRun(client)).toBe(false)
    expect(await sourceCommands(mkTick(fetch))).toBe(1)
    expect(seen).toHaveLength(1)
    expect(seen[0].auth).toBe('tok-fixture')
    expect(seen[0].body.variables).toEqual({ board: '1001', item: '777', column: 'color_x', value: 'Done' })
    expect(seen[0].body.query).not.toContain('create_labels_if_missing')
    expect(await row(id)).toMatchObject({ status: 'done', result: { item_id: '777', status: 'Done' } })
    expect((await row(id)).done_at).not.toBeNull()
    expect(await nextRun(client)).toBe(true)
    expect(await sourceCommands(mkTick(fetch))).toBe(0) // nothing left to claim
  })

  it('set_status_undone: restores the status the done command recorded from the synced row', async () => {
    const client = await fixture()
    await sql(`insert into data.jobs (client_id, source, external_id, kind, title, status, is_done) values ($1, 'monday', '42', 'task', 't', 'Working on it', false)`, [client])
    const bodies: any[] = []
    const fetch = (async (_u: unknown, init: any) => { bodies.push(JSON.parse(init.body)); return new Response(JSON.stringify({ data: { change_simple_column_value: { id: '42' } } })) }) as unknown as typeof globalThis.fetch
    const doneId = await queue(client, 'monday', 'set_status_done', { item_id: '42' })
    const undoId = await queue(client, 'monday', 'set_status_undone', { item_id: '42' })
    expect(await sourceCommands(mkTick(fetch))).toBe(2)
    expect(await row(doneId)).toMatchObject({ status: 'done', result: { item_id: '42', status: 'Done', previous: 'Working on it' } })
    expect(await row(undoId)).toMatchObject({ status: 'done', result: { item_id: '42', status: 'Working on it' } })
    expect(bodies.map(b => b.variables.value)).toEqual(['Done', 'Working on it'])
  })

  it('set_status_undone with no earlier done command clears the label', async () => {
    const client = await fixture()
    const id = await queue(client, 'monday', 'set_status_undone', { item_id: '43' })
    const bodies: any[] = []
    const fetch = (async (_u: unknown, init: any) => { bodies.push(JSON.parse(init.body)); return new Response(JSON.stringify({ data: { change_simple_column_value: { id: '43' } } })) }) as unknown as typeof globalThis.fetch
    await sourceCommands(mkTick(fetch))
    expect(await row(id)).toMatchObject({ status: 'done', result: { item_id: '43', status: null } })
    expect(bodies[0].variables.value).toBe('')
  })

  it('a Monday rejection marks it failed with the reason; the schedule is left alone', async () => {
    const client = await fixture({ board_id: '1001', columns: { status: 'color_x' }, done_statuses: ['Complete'] })
    const id = await queue(client, 'monday', 'set_status_done', { item_id: '5' })
    const fetch = (async () => new Response(JSON.stringify({ errors: [{ message: 'Label Complete does not exist' }] }))) as unknown as typeof globalThis.fetch
    await sourceCommands(mkTick(fetch))
    const r = await row(id)
    expect(r.status).toBe('failed')
    expect(r.result.error).toMatch(/Label Complete does not exist/)
    expect(await nextRun(client)).toBe(false)
  })

  it('set_status_undone: a Monday rejection marks the undo failed with the reason', async () => {
    const client = await fixture()
    const id = await queue(client, 'monday', 'set_status_undone', { item_id: '44' })
    const fetch = (async () => new Response(JSON.stringify({ errors: [{ message: 'Label Working on it does not exist' }] }))) as unknown as typeof globalThis.fetch
    await sourceCommands(mkTick(fetch))
    const r = await row(id)
    expect(r.status).toBe('failed')
    expect(r.result.error).toMatch(/Label Working on it does not exist/)
  })

  it('unknown kind, unknown source and a bad payload fail with a reason and never reach the network', async () => {
    const client = await fixture()
    const ids = [
      await queue(client, 'monday', 'delete_everything', {}),
      await queue(client, 'upload', 'set_status_done', {}),
      await queue(client, 'monday', 'constructor', {}),
      await queue(client, 'monday', 'set_status_done', { item_id: 'not-a-number' }),
    ]
    let calls = 0
    const fetch = (async () => { calls++; return new Response('{}') }) as unknown as typeof globalThis.fetch
    expect(await sourceCommands(mkTick(fetch))).toBe(4)
    const rows = await Promise.all(ids.map(row))
    expect(rows.map(r => r.status)).toEqual(['failed', 'failed', 'failed', 'failed'])
    expect(rows[0].result.error).toBe('unknown command: monday/delete_everything')
    expect(rows[1].result.error).toBe('unknown command: upload/set_status_done')
    expect(rows[2].result.error).toBe('unknown command: monday/constructor')
    expect(rows[3].result.error).toContain('item_id')
    expect(calls).toBe(0)
  })

  it('is idempotent to re-run: a command is claimed once', async () => {
    const client = await fixture()
    await queue(client, 'monday', 'set_status_done', { item_id: '9' })
    let calls = 0
    const fetch = (async () => { calls++; return new Response(JSON.stringify({ data: { change_simple_column_value: { id: '9' } } })) }) as unknown as typeof globalThis.fetch
    await Promise.all([sourceCommands(mkTick(fetch)), sourceCommands(mkTick(fetch))])
    expect(calls).toBe(1)
  })
})

describe('set_home_layout + client_v1', () => {
  const layout = { v: 1, items: [{ i: 'tasks', x: 0, y: 0, w: 4, h: 3 }] }
  it('a member persists it, client_v1 reads it back, null resets; another tenant is untouched', async () => {
    const { client } = await signIn(USERS.acmeMember)
    expect((await client.rpc('set_home_layout', { p_layout: layout })).error).toBeNull()
    expect((await client.from('client_v1').select('home_layout, branding').single()).data).toEqual({ home_layout: layout, branding: null })
    expect((await sql(`select home_layout from data.clients where id = $1`, [CLIENTS.beta])).rows[0].home_layout).toBeNull()
    expect((await client.rpc('set_home_layout', { p_layout: null })).error).toBeNull()
    expect((await client.from('client_v1').select('home_layout').single()).data).toEqual({ home_layout: null })
  })
  it('refuses non-objects (BCNS3), > 16KB (BCNS5), and a caller with no client (BCNS0); keeps the stored value', async () => {
    const { client } = await signIn(USERS.acmeOwner)
    await client.rpc('set_home_layout', { p_layout: layout })
    for (const bad of [[], [layout], 'x', 5, true]) expect((await client.rpc('set_home_layout', { p_layout: bad })).error?.code, JSON.stringify(bad)).toBe('BCNS3')
    const big = { v: 1, items: [], pad: 'z'.repeat(17_000) }
    expect((await client.rpc('set_home_layout', { p_layout: big })).error?.code).toBe('BCNS5')
    const edge = { v: 1, items: [], pad: 'z'.repeat(16_300) }
    expect((await client.rpc('set_home_layout', { p_layout: edge })).error).toBeNull()
    expect((await client.rpc('set_home_layout', { p_layout: layout })).error).toBeNull()
    expect((await client.from('client_v1').select('home_layout').single()).data).toEqual({ home_layout: layout })
    expect((await (await nobodyClient()).rpc('set_home_layout', { p_layout: layout })).error?.code).toBe('BCNS0')
  })
})

describe('branding + jobs.position', () => {
  it('public `branding` bucket exists, png only, no authenticated write policy; service role uploads, anyone can read it', async () => {
    const b = (await sql(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'branding'`)).rows[0]
    expect(b).toEqual({ public: true, file_size_limit: '1048576', allowed_mime_types: ['image/png'] })
    const pol = await sql(`select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and (qual ilike '%branding%' or with_check ilike '%branding%')`)
    expect(pol.rows).toEqual([])
    const { PNG_1x1 } = await import('./helpers.js')
    const path = `${CLIENTS.acme}/logo.png`
    const up = await serviceClient().storage.from('branding').upload(path, PNG_1x1, { contentType: 'image/png', upsert: true })
    expect(up.error).toBeNull()
    try {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/branding/${path}`)
      expect(res.status).toBe(200)
      const { client } = await signIn(USERS.acmeOwner)
      expect((await client.storage.from('branding').upload(`${CLIENTS.acme}/evil.png`, PNG_1x1, { contentType: 'image/png' })).error).not.toBeNull()
    } finally { await serviceClient().storage.from('branding').remove([path]) }
  })

  it('client_v1.branding reads what the column holds; jobs_v1 carries position', async () => {
    await sql(`update data.clients set branding = '{"name":"Acme Co","accent":"#336699"}' where id = $1`, [CLIENTS.acme])
    try {
      const { client } = await signIn(USERS.acmeMember)
      expect((await client.from('client_v1').select('branding').single()).data).toEqual({ branding: { name: 'Acme Co', accent: '#336699' } })
      expect((await client.from('jobs_v1').select('id, position').limit(1)).error).toBeNull()
    } finally { await sql(`update data.clients set branding = null where id = $1`, [CLIENTS.acme]) }
    const ext = 'pos-test-1'
    await sql(`insert into data.jobs (client_id, source, external_id, kind, title, position) values ($1, 'monday', $2, 'task', 't', 3) on conflict do nothing`, [CLIENTS.acme, ext])
    try {
      const { client } = await signIn(USERS.acmeMember)
      expect((await client.from('jobs_v1').select('position').eq('external_id', ext).single()).data).toEqual({ position: 3 })
    } finally { await sql(`delete from data.jobs where client_id = $1 and external_id = $2`, [CLIENTS.acme, ext]) }
  })
})
