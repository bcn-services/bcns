import { describe, it, expect, afterAll } from 'vitest'
import { sql, pool, rest, signIn, anonClient, apiViews, betaRpcArgs, betaSnapshot, USERS, CLIENTS, localKeys, thumbPath } from './helpers.js'

afterAll(() => pool.end())

const rpcCode = (e: any) => e?.code

describe('tenant isolation', () => {
  it('rpc_every_write_scoped', async () => {
    const rpcs = (await sql<{ proname: string }>(`select proname from pg_proc where pronamespace = 'api'::regnamespace order by 1`)).rows.map(r => r.proname)
    const argsFor = await betaRpcArgs()
    const before = await betaSnapshot()
    const { client } = await signIn(USERS.acmeOwner)
    await sql(`delete from data.media_sets where client_id = $1 and name = 'rpc-scoped-test'`, [CLIENTS.acme])
    const acmeCreated: string[] = []
    for (const name of rpcs) {
      const spec = argsFor[name]
      expect(spec, `no RPC_ARGS entry for ${name}`).toBeDefined()
      const { data, error } = await client.rpc(name, spec.args)
      if (spec.expect.startsWith('BCNS')) expect(rpcCode(error), name).toBe(spec.expect)
      else if (spec.expect === 'ignored') { expect(error, name).toBeNull(); expect(data, name).toBe(0) }
      else { expect(error, name).toBeNull(); if (typeof data === 'string') acmeCreated.push(data) }
    }
    expect(await betaSnapshot()).toEqual(before)
    // clean acme-side rows created by the 'none' RPCs
    await sql(`delete from data.records where client_id = $1 and external_id = 'rec-0' and source = 'dashboard' and id = any($2::uuid[])`, [CLIENTS.acme, acmeCreated])
    await sql(`delete from data.media_sets where client_id = $1 and name = 'rpc-scoped-test'`, [CLIENTS.acme])
    await sql(`delete from data.dashboard_versions where client_id = $1`, [CLIENTS.acme])
  })

  it('forbidden_read_views', async () => {
    for (const u of [USERS.acmeMember, USERS.betaMember]) {
      const { client } = await signIn(u)
      for (const v of await apiViews()) {
        const { data, count, error } = await client.from(v).select('client_id', { count: 'exact' })
        expect(error, v).toBeNull()
        const expected = (await sql(`select count(*)::int n from api.${v} where client_id = $1`, [u.client])).rows[0].n
        expect(count, `${u.email} ${v}`).toBe(expected)
        for (const row of data!) expect(row.client_id, v).toBe(u.client)
      }
    }
  })

  it('forbidden_read_rpcs', async () => {
    const { client } = await signIn(USERS.acmeMember)
    const argsFor = await betaRpcArgs()
    const { error } = await client.rpc('download_url', argsFor.download_url.args)
    expect(rpcCode(error)).toBe('BCNS4')
  })

  it('member_cannot_remove', async () => {
    const { client } = await signIn(USERS.acmeMember)
    const { error } = await client.rpc('remove_member', { target_user_id: USERS.acmeOwner.id })
    expect(rpcCode(error)).toBe('BCNS2')
    expect((await sql(`select 1 from data.memberships where user_id = $1`, [USERS.acmeOwner.id])).rowCount).toBe(1)
  })

  it('owner_cross_tenant_remove', async () => {
    const { client } = await signIn(USERS.acmeOwner)
    const { error } = await client.rpc('remove_member', { target_user_id: USERS.betaMember.id })
    expect(rpcCode(error)).toBe('BCNS4')
    expect((await sql(`select client_id from data.memberships where user_id = $1`, [USERS.betaMember.id])).rows[0].client_id).toBe(CLIENTS.beta)
  })

  it('anon_key_zero', async () => {
    const c = anonClient()
    for (const v of await apiViews()) {
      const { data, error } = await c.from(v).select('*').limit(5)
      // anon holds no grant on api objects: PostgREST answers 42501 (permission denied), never rows.
      expect((data ?? []).length, v).toBe(0)
      expect(error?.code, v).toBe('42501')
    }
    const argsFor = await betaRpcArgs()
    for (const [name, spec] of Object.entries(argsFor)) {
      const { data, error } = await c.rpc(name, spec.args)
      expect(data, name).toBeNull()
      expect(['42501', 'BCNS0'], name).toContain(error?.code)
    }
    const list = await c.storage.from('media').list(CLIENTS.acme)
    expect(list.data ?? []).toEqual([])
    const sign = await c.storage.from('media').createSignedUrl(thumbPath('acme', 1), 60)
    expect(sign.error).not.toBeNull()
  })

  it('membership_removed_next_request', async () => {
    const { client, token } = await signIn(USERS.acmeMember)
    expect((await client.from('client_v1').select('client_id')).data).toHaveLength(1)
    await sql(`delete from data.memberships where user_id = $1`, [USERS.acmeMember.id])
    try {
      for (const v of await apiViews()) expect((await rest(`${v}?limit=5`, token)).body, v).toEqual([])
      const { error } = await client.rpc('save_record', { kind: 'note', attributes: {} })
      expect(rpcCode(error)).toBe('BCNS0')
    } finally {
      await sql(`insert into data.memberships (user_id, client_id, role, is_smoke) values ($1, $2, 'member', false)`, [USERS.acmeMember.id, CLIENTS.acme])
    }
  })

  it('client_churned_next_request', async () => {
    const { client, token } = await signIn(USERS.acmeMember)
    await sql(`update data.clients set status = 'churned' where id = $1`, [CLIENTS.acme])
    try {
      expect((await sql(`select churned_at from data.clients where id = $1`, [CLIENTS.acme])).rows[0].churned_at).not.toBeNull()
      for (const v of await apiViews()) expect((await rest(`${v}?limit=5`, token)).body, v).toEqual([])
      const { error } = await client.rpc('save_record', { kind: 'note', attributes: {} })
      expect(rpcCode(error)).toBe('BCNS0')
      const r = await fetch(`${process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { apikey: localKeys().anon, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: USERS.acmeMember.email, password: USERS.acmeMember.password }) })
      expect(r.status).toBe(403)
    } finally {
      await sql(`update data.clients set status = 'active', churned_at = null where id = $1`, [CLIENTS.acme])
    }
  })
})
