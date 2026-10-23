// Staff access (20261023162500): data.staff lets one operator account sign in to any active client.
// Drives the real hook through GoTrue and the real RLS helpers through PostgREST. Builds its own
// fixture users and removes them afterwards; seed.sql is not touched.
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { CLIENTS, clientWithToken, decodeJwt, anonClient, mintJwt, pool, serviceClient, sql } from './helpers.js'

const PASSWORD = 'password-staff'
const users: string[] = []

async function newUser(client?: string) {
  const email = `zz-staff-${randomUUID().slice(0, 8)}@example.test`
  const { data, error } = await serviceClient().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  users.push(data.user.id)
  if (client) await sql(`insert into data.memberships (user_id, client_id, role) values ($1, $2, 'member')`, [data.user.id, client])
  return { id: data.user.id, email }
}
const setStaff = (id: string, client: string) =>
  sql(`insert into data.staff (user_id, client_id) values ($1, $2) on conflict (user_id) do update set client_id = excluded.client_id`, [id, client])

async function login(email: string) {
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password: PASSWORD })
  if (error || !data.session) throw new Error(`signIn: ${error?.message}`)
  const token = data.session.access_token
  return { token, claims: decodeJwt(token), api: clientWithToken(token) }
}
/** client_ids the token can read through api.client_v1 (RLS: only the active workspace). */
async function visible(api: ReturnType<typeof clientWithToken>) {
  const { data, error } = await api.from('client_v1').select('client_id')
  expect(error).toBeNull()
  return (data ?? []).map(r => r.client_id)
}

afterAll(async () => {
  for (const id of users) await serviceClient().auth.admin.deleteUser(id)
  await pool.end()
})

describe('data.staff', () => {
  it('a staff user with no membership lands in the staff workspace as owner and reads only it', async () => {
    const u = await newUser()
    await setStaff(u.id, CLIENTS.beta)
    const s = await login(u.email)
    expect(s.claims).toMatchObject({ client_id: CLIENTS.beta, client_role: 'owner' })
    expect(await visible(s.api)).toEqual([CLIENTS.beta])
  })

  it('moving the staff row cuts the old token off and a new sign-in follows it', async () => {
    const u = await newUser()
    await setStaff(u.id, CLIENTS.beta)
    const old = await login(u.email)
    await setStaff(u.id, CLIENTS.acme)
    expect(await visible(old.api)).toEqual([])
    expect(await visible((await login(u.email)).api)).toEqual([CLIENTS.acme])
  })

  it('deleting the staff row revokes immediately and the hook refuses a user with no membership', async () => {
    const u = await newUser()
    await setStaff(u.id, CLIENTS.beta)
    const s = await login(u.email)
    await sql(`delete from data.staff where user_id = $1`, [u.id])
    expect(await visible(s.api)).toEqual([])
    const hook = await sql(`select public.custom_access_token_hook(jsonb_build_object('user_id', $1::text, 'claims', '{}'::jsonb)) out`, [u.id])
    expect(hook.rows[0].out.error).toMatchObject({ http_code: 403 })
  })

  it('a staff row pointing at a non-active client falls back to the own membership', async () => {
    const u = await newUser(CLIENTS.acme)
    await setStaff(u.id, CLIENTS.gamma) // seeded paused client
    const s = await login(u.email)
    expect(s.claims).toMatchObject({ client_id: CLIENTS.acme, client_role: 'member' })
    expect(await visible(s.api)).toEqual([CLIENTS.acme])
  })

  it('a staff row on a non-active client with no membership is still refused', async () => {
    const u = await newUser()
    await setStaff(u.id, CLIENTS.gamma) // seeded paused client
    const hook = await sql(`select public.custom_access_token_hook(jsonb_build_object('user_id', $1::text, 'claims', '{}'::jsonb)) out`, [u.id])
    expect(hook.rows[0].out.error).toMatchObject({ http_code: 403 })
  })

  it('staff is owner even where the user holds a plain member membership', async () => {
    const u = await newUser(CLIENTS.acme)
    await setStaff(u.id, CLIENTS.acme)
    const s = await login(u.email)
    expect(s.claims).toMatchObject({ client_id: CLIENTS.acme, client_role: 'owner' })
    // owner-only RPC: a member gets BCNS2 forbidden_role; staff passes the role gate (target is unknown -> BCNS4, not BCNS2)
    const { error } = await s.api.rpc('remove_member', { target_user_id: randomUUID() })
    expect(error?.code).toBe('BCNS4')
  })

  it('a token forged for another client reads nothing', async () => {
    const u = await newUser()
    await setStaff(u.id, CLIENTS.beta)
    const forged = await mintJwt(u.id, { client_id: CLIENTS.acme, client_role: 'owner' })
    expect(await visible(clientWithToken(forged))).toEqual([])
  })

  it('no role below postgres/auth-admin can read or write data.staff', async () => {
    const r = await sql<{ r: string; priv: boolean }>(
      `select r, has_table_privilege(r, 'data.staff', 'select,insert,update,delete') priv
         from unnest(array['anon','authenticated','service_role']) r`)
    expect(r.rows.filter(x => x.priv)).toEqual([])
  })
})
