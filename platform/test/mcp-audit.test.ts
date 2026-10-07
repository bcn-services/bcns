// Chunk 6c PR C database half (migration 20261006000100): data.mcp_tool_calls + api.log_mcp_call,
// data.ai_settings + api.get_ai_settings / api.set_ai_settings. Every fixture client is synthetic,
// so the shared acme/beta/gamma seed is untouched.
// Needs the local stack (supabase start in platform/) with migrations applied.
import { afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { anonClient, clientWithToken, mintJwt, pool, serviceClient, sql } from './helpers.js'

const made: string[] = []
const users: string[] = []

async function mkClient(): Promise<string> {
  const id = randomUUID()
  made.push(id)
  await sql(`insert into data.clients (id, slug, name, timezone) values ($1, $2, 'MCP Audit', 'America/New_York')`, [id, `ma-${id.slice(0, 8)}`])
  return id
}

interface Who { id: string; client: string; jwt: string }
async function mkUser(client: string, role: 'owner' | 'member'): Promise<Who> {
  const { data, error } = await serviceClient().auth.admin.createUser({
    email: `ma-${randomUUID().slice(0, 8)}@example.test`, password: 'password-ma', email_confirm: true })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  users.push(data.user.id)
  await sql(`insert into data.memberships (user_id, client_id, role) values ($1, $2, $3)`, [data.user.id, client, role])
  return { id: data.user.id, client, jwt: await mintJwt(data.user.id, { client_id: client }) }
}

/** Run `q` as the `authenticated` role with `who`'s claims, the way PostgREST would. Always rolled back. */
async function asRole<T>(who: Who, q: string): Promise<T[]> {
  const c = await pool.connect()
  try {
    await c.query('begin')
    await c.query('set local role authenticated')
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: who.id, role: 'authenticated', client_id: who.client })])
    return (await c.query(q)).rows
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
}

afterAll(async () => {
  for (const u of users) await serviceClient().auth.admin.deleteUser(u)
  // ai_settings and mcp_tool_calls cascade from clients.
  if (made.length) await sql(`delete from data.clients where id = any($1::uuid[])`, [made])
  await pool.end()
})

const read = async (who: Who) => (await clientWithToken(who.jwt).rpc('get_ai_settings')).data

describe('ai settings', () => {
  it('a missing row reads as off, and the owner can switch it on and off', async () => {
    const c = await mkClient()
    const owner = await mkUser(c, 'owner')
    expect(await read(owner)).toEqual({ share_customer_contact: false })

    let r = await clientWithToken(owner.jwt).rpc('set_ai_settings', { p_share_customer_contact: true })
    expect(r.error).toBeNull()
    expect(await read(owner)).toEqual({ share_customer_contact: true })
    const row = (await sql(`select share_customer_contact, updated_by from data.ai_settings where client_id = $1`, [c])).rows
    expect(row).toEqual([{ share_customer_contact: true, updated_by: owner.id }])

    r = await clientWithToken(owner.jwt).rpc('set_ai_settings', { p_share_customer_contact: false })
    expect(r.error).toBeNull()
    expect(await read(owner)).toEqual({ share_customer_contact: false })
    expect((await sql(`select count(*)::int n from data.ai_settings where client_id = $1`, [c])).rows[0].n).toBe(1)
  })

  it('a member can read but not set (BCNS2), and nothing changes', async () => {
    const c = await mkClient()
    const owner = await mkUser(c, 'owner'), member = await mkUser(c, 'member')
    await clientWithToken(owner.jwt).rpc('set_ai_settings', { p_share_customer_contact: true })
    expect(await read(member)).toEqual({ share_customer_contact: true })

    const { error } = await clientWithToken(member.jwt).rpc('set_ai_settings', { p_share_customer_contact: false })
    expect(error?.code).toBe('BCNS2')
    expect(await read(owner)).toEqual({ share_customer_contact: true })
  })

  it('a token for tenant A claiming tenant B gets BCNS0 and writes nothing for B', async () => {
    const a = await mkUser(await mkClient(), 'owner'), b = await mkUser(await mkClient(), 'owner')
    const forged = clientWithToken(await mintJwt(a.id, { client_id: b.client }))
    expect((await forged.rpc('log_mcp_call', { p_tool: 'forged', p_view: null, p_row_count: 0, p_ok: true, p_error_code: null })).error?.code).toBe('BCNS0')
    expect((await forged.rpc('set_ai_settings', { p_share_customer_contact: true })).error?.code).toBe('BCNS0')
    for (const t of ['mcp_tool_calls', 'ai_settings'])
      expect((await sql(`select count(*)::int n from data.${t} where client_id = $1`, [b.client])).rows[0].n, t).toBe(0)
  })

  it('a null value is refused (BCNS3)', async () => {
    const owner = await mkUser(await mkClient(), 'owner')
    const { error } = await clientWithToken(owner.jwt).rpc('set_ai_settings', { p_share_customer_contact: null })
    expect(error?.code).toBe('BCNS3')
  })

  it('tenants are isolated: B neither reads nor changes A\'s setting', async () => {
    const a = await mkUser(await mkClient(), 'owner'), b = await mkUser(await mkClient(), 'owner')
    await clientWithToken(a.jwt).rpc('set_ai_settings', { p_share_customer_contact: true })
    expect(await read(b)).toEqual({ share_customer_contact: false })
    expect((await asRole<{ client_id: string }>(b, `select client_id from data.ai_settings`))).toEqual([])
    expect((await asRole<{ client_id: string }>(a, `select client_id from data.ai_settings`)).map(r => r.client_id)).toEqual([a.client])

    await clientWithToken(b.jwt).rpc('set_ai_settings', { p_share_customer_contact: false })
    expect(await read(a)).toEqual({ share_customer_contact: true })
  })

  it('a token with no client claim gets BCNS0 on read and write; the anon key gets nothing', async () => {
    const owner = await mkUser(await mkClient(), 'owner')
    const noClaim = clientWithToken(await mintJwt(owner.id))
    expect((await noClaim.rpc('get_ai_settings')).error?.code).toBe('BCNS0')
    expect((await noClaim.rpc('set_ai_settings', { p_share_customer_contact: true })).error?.code).toBe('BCNS0')
    for (const [fn, args] of [['get_ai_settings', {}], ['set_ai_settings', { p_share_customer_contact: true }]] as const) {
      const { data, error } = await anonClient().rpc(fn, args)
      expect(data).toBeNull()
      expect(['42501', 'BCNS0']).toContain(error?.code)
    }
  })
})

describe('api.log_mcp_call', () => {
  const call = { p_tool: 'read_view', p_view: 'customers_v1', p_row_count: 3, p_ok: true, p_error_code: null }

  it('writes a row stamped with the caller\'s tenant and uid', async () => {
    const c = await mkClient()
    const member = await mkUser(c, 'member')
    const { error } = await clientWithToken(member.jwt).rpc('log_mcp_call', call)
    expect(error).toBeNull()
    const rows = (await sql(`select client_id, user_id, tool, view, row_count, ok, error_code, at from data.mcp_tool_calls where client_id = $1`, [c])).rows
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ client_id: c, user_id: member.id, tool: 'read_view', view: 'customers_v1', row_count: 3, ok: true, error_code: null })
    expect(Math.abs(Date.now() - rows[0].at.getTime())).toBeLessThan(60_000)
  })

  it('records a failure with nulls for view and count; long text is cut to 64 chars', async () => {
    const c = await mkClient()
    const u = await mkUser(c, 'member')
    const long = 'x'.repeat(200)
    const { error } = await clientWithToken(u.jwt).rpc('log_mcp_call',
      { p_tool: long, p_view: long, p_row_count: null, p_ok: false, p_error_code: long })
    expect(error).toBeNull()
    const r = (await sql(`select tool, view, row_count, ok, error_code from data.mcp_tool_calls where client_id = $1`, [c])).rows[0]
    expect(r).toEqual({ tool: 'x'.repeat(64), view: 'x'.repeat(64), row_count: null, ok: false, error_code: 'x'.repeat(64) })
  })

  it('an empty tool name is refused (BCNS3) and writes nothing', async () => {
    const c = await mkClient()
    const u = await mkUser(c, 'member')
    const { error } = await clientWithToken(u.jwt).rpc('log_mcp_call', { ...call, p_tool: '' })
    expect(error?.code).toBe('BCNS3')
    expect((await sql(`select count(*)::int n from data.mcp_tool_calls where client_id = $1`, [c])).rows[0].n).toBe(0)
  })

  it('tenant A cannot see tenant B\'s audit rows', async () => {
    const a = await mkUser(await mkClient(), 'member'), b = await mkUser(await mkClient(), 'member')
    await clientWithToken(a.jwt).rpc('log_mcp_call', { ...call, p_tool: 'a-tool' })
    await clientWithToken(b.jwt).rpc('log_mcp_call', { ...call, p_tool: 'b-tool' })
    expect((await asRole<{ tool: string }>(a, `select tool from data.mcp_tool_calls`)).map(r => r.tool)).toEqual(['a-tool'])
    expect((await asRole<{ tool: string }>(b, `select tool from data.mcp_tool_calls`)).map(r => r.tool)).toEqual(['b-tool'])
  })

  it('a token with no client claim gets BCNS0 and writes nothing; the anon key is refused', async () => {
    const c = await mkClient()
    const u = await mkUser(c, 'member')
    const { error } = await clientWithToken(await mintJwt(u.id)).rpc('log_mcp_call', call)
    expect(error?.code).toBe('BCNS0')
    const anon = await anonClient().rpc('log_mcp_call', call)
    expect(['42501', 'BCNS0']).toContain(anon.error?.code)
    expect((await sql(`select count(*)::int n from data.mcp_tool_calls where client_id = $1`, [c])).rows[0].n).toBe(0)
  })

  it('direct writes to the audit table are denied, even for a member of that tenant', async () => {
    const c = await mkClient()
    const u = await mkUser(c, 'owner')
    const insert = `insert into data.mcp_tool_calls (client_id, user_id, tool, ok) values ('${c}', '${u.id}', 'forged', true)`
    await expect(asRole(u, insert)).rejects.toMatchObject({ code: '42501' })
    await expect(asRole(u, `update data.mcp_tool_calls set tool = 'x'`)).rejects.toMatchObject({ code: '42501' })
    await expect(asRole(u, `delete from data.mcp_tool_calls`)).rejects.toMatchObject({ code: '42501' })
    await expect(asRole(u, `insert into data.ai_settings (client_id, share_customer_contact) values ('${c}', true)`)).rejects.toMatchObject({ code: '42501' })
    expect((await sql(`select count(*)::int n from data.mcp_tool_calls where client_id = $1`, [c])).rows[0].n).toBe(0)
  })
})

describe('api.ai_last_used_at', () => {
  const call = { p_tool: 'read_view', p_view: 'money_v1', p_row_count: 1, p_ok: true, p_error_code: null }
  const lastUsed = async (who: Who) => (await clientWithToken(who.jwt).rpc('ai_last_used_at'))

  it('is null while the workspace has made no AI call', async () => {
    const u = await mkUser(await mkClient(), 'member')
    const r = await lastUsed(u)
    expect(r.error).toBeNull()
    expect(r.data).toBeNull()
  })

  it('returns the newest call time, whichever member made it', async () => {
    const c = await mkClient()
    const owner = await mkUser(c, 'owner'), member = await mkUser(c, 'member')
    await sql(`insert into data.mcp_tool_calls (client_id, user_id, tool, ok, at) values ($1, $2, 'old', true, now() - interval '3 days')`, [c, owner.id])
    await clientWithToken(member.jwt).rpc('log_mcp_call', call)
    const newest = (await sql(`select max(at) m from data.mcp_tool_calls where client_id = $1`, [c])).rows[0].m as Date
    const r = await lastUsed(owner)
    expect(r.error).toBeNull()
    expect(new Date(r.data as string).getTime()).toBe(newest.getTime())
  })

  it('tenant A never sees tenant B\'s latest call', async () => {
    const a = await mkUser(await mkClient(), 'owner'), b = await mkUser(await mkClient(), 'owner')
    await clientWithToken(b.jwt).rpc('log_mcp_call', call)
    expect((await lastUsed(a)).data).toBeNull()
    expect((await lastUsed(b)).data).not.toBeNull()
  })

  it('a token with no client claim gets BCNS0; the anon key is refused', async () => {
    const u = await mkUser(await mkClient(), 'owner')
    expect((await clientWithToken(await mintJwt(u.id)).rpc('ai_last_used_at')).error?.code).toBe('BCNS0')
    expect(['42501', 'BCNS0']).toContain((await anonClient().rpc('ai_last_used_at')).error?.code)
  })
})
