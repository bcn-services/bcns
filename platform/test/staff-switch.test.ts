// Staff switcher (20261023173744): api.staff_workspaces / api.staff_switch_client move only the
// caller's own data.staff row; a refresh then re-runs the real hook so the token follows.
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { CLIENTS, clientWithToken, decodeJwt, anonClient, pool, serviceClient, sql } from './helpers.js'

const PASSWORD = 'password-switch'
const users: string[] = []
const tag = randomUUID().slice(0, 8)
const fixture = { zebra: `zz-sw-b-${tag}`, aardvark: `zz-sw-a-${tag}` }
const excluded = ['shopify-review', 'meta-review', 'pjg']
const created: string[] = []
let aardvarkId = ''

async function newClient(slug: string, name: string, status = 'active') {
  const r = await sql(`insert into data.clients (slug, name, status) values ($1, $2, $3) on conflict (slug) do update set status = excluded.status returning id`, [slug, name, status])
  created.push(r.rows[0].id)
  return r.rows[0].id as string
}
async function newUser(client?: string) {
  const email = `zz-switch-${randomUUID().slice(0, 8)}@example.test`
  const { data, error } = await serviceClient().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  users.push(data.user.id)
  if (client) await sql(`insert into data.memberships (user_id, client_id, role) values ($1, $2, 'member')`, [data.user.id, client])
  return { id: data.user.id, email }
}
const setStaff = (id: string, client: string) => sql(`insert into data.staff (user_id, client_id) values ($1, $2)`, [id, client])
const staffRow = async (id: string) => (await sql(`select client_id from data.staff where user_id = $1`, [id])).rows[0]?.client_id

async function login(email: string) {
  const anon = anonClient()
  const { data, error } = await anon.auth.signInWithPassword({ email, password: PASSWORD })
  if (error || !data.session) throw new Error(`signIn: ${error?.message}`)
  const token = data.session.access_token
  return { anon, token, claims: decodeJwt(token), api: clientWithToken(token) }
}
async function visible(api: ReturnType<typeof clientWithToken>) {
  const { data, error } = await api.from('client_v1').select('client_id')
  expect(error).toBeNull()
  return (data ?? []).map(r => r.client_id)
}

afterAll(async () => {
  for (const id of users) await serviceClient().auth.admin.deleteUser(id)
  for (const id of created) await sql(`delete from data.clients where id = $1`, [id])
  await pool.end()
})

describe('staff switcher', () => {
  it('staff sees active non-excluded workspaces by name, one current; others get []', async () => {
    const zebra = await newClient(fixture.zebra, `Zebra ${tag}`)
    aardvarkId = await newClient(fixture.aardvark, `Aardvark ${tag}`)
    for (const slug of excluded) await newClient(slug, `Excluded ${slug}`)
    await newClient(`zz-sw-p-${tag}`, `Paused ${tag}`, 'paused')
    const staff = await newUser()
    await setStaff(staff.id, zebra)
    const s = await login(staff.email)
    const { data, error } = await s.api.rpc('staff_workspaces')
    expect(error).toBeNull()
    const slugs = data.map((w: any) => w.slug)
    expect(slugs).toContain(fixture.zebra)
    expect(slugs.indexOf(fixture.aardvark)).toBeLessThan(slugs.indexOf(fixture.zebra))
    for (const slug of [...excluded, `zz-sw-p-${tag}`]) expect(slugs).not.toContain(slug)
    expect(data.filter((w: any) => w.current).map((w: any) => w.slug)).toEqual([fixture.zebra])

    for (const u of [await newUser(CLIENTS.acme)]) { // a user with no membership and no staff row cannot even sign in
      const o = await login(u.email)
      expect((await o.api.rpc('staff_workspaces')).data).toEqual([])
      const sw = await o.api.rpc('staff_switch_client', { p_slug: fixture.zebra })
      expect(sw.error?.code).toBe('BCNS2')
      expect(await staffRow(u.id)).toBeUndefined() // never inserts
    }
  })

  it('refuses excluded, paused and unknown slugs with the same error', async () => {
    const staff = await newUser()
    await setStaff(staff.id, CLIENTS.beta)
    const s = await login(staff.email)
    for (const slug of [...excluded, `zz-sw-p-${tag}`, 'no-such-slug']) {
      const { error } = await s.api.rpc('staff_switch_client', { p_slug: slug })
      expect(error?.code, slug).toBe('BCNS4')
    }
    expect(await staffRow(staff.id)).toBe(CLIENTS.beta)
  })

  it('moves only the caller row, and a refreshed token follows while the old one reads nothing', async () => {
    const a = await newUser()
    const b = await newUser()
    await setStaff(a.id, CLIENTS.beta)
    await setStaff(b.id, CLIENTS.beta)
    const s = await login(a.email)
    expect(s.claims.client_id).toBe(CLIENTS.beta)
    const { error } = await s.api.rpc('staff_switch_client', { p_slug: fixture.aardvark })
    expect(error).toBeNull()
    expect(await staffRow(b.id)).toBe(CLIENTS.beta)
    expect(await visible(s.api)).toEqual([])

    const { data, error: rerr } = await s.anon.auth.refreshSession()
    expect(rerr).toBeNull()
    const fresh = data.session!.access_token
    expect(decodeJwt(fresh)).toMatchObject({ client_id: aardvarkId, client_role: 'owner' })
    expect(await visible(clientWithToken(fresh))).toEqual([aardvarkId])
  })
})
