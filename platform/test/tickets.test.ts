// Hub support tickets (migration *_support_tickets.sql, apps/connect /support). Tenant isolation is
// the point: a member of X reads none of Y's tickets, cannot insert one for Y, and cannot aim
// api.ticket_create anywhere but their own workspace. Synthetic clients, so the shared seed is
// untouched. Needs the local stack; skips with the other DB files when it is down, runs in CI.
import { afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { clientWithToken, mintJwt, pool, serviceClient, sql } from './helpers.js'

const made: string[] = []
const users: string[] = []

async function mkClient(): Promise<{ id: string; slug: string }> {
  const id = randomUUID()
  made.push(id)
  const slug = `tk-${id.slice(0, 8)}`
  await sql(`insert into data.clients (id, slug, name, timezone) values ($1, $2, 'Ticket Fixture', 'UTC')`, [id, slug])
  return { id, slug }
}

async function mkMember(client: string) {
  const { data, error } = await serviceClient().auth.admin.createUser({
    email: `tk-${randomUUID().slice(0, 8)}@example.test`, password: 'password-tk', email_confirm: true })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  users.push(data.user.id)
  await sql(`insert into data.memberships (user_id, client_id, role) values ($1, $2, 'member')`, [data.user.id, client])
  const token = await mintJwt(data.user.id, { client_id: client })
  return { userId: data.user.id, token, api: clientWithToken(token) }
}

afterAll(async () => {
  for (const u of users) await serviceClient().auth.admin.deleteUser(u)
  if (made.length) await sql(`delete from data.clients where id = any($1::uuid[])`, [made]) // tickets cascade
  await pool.end()
})

describe('data.tickets', () => {
  it('has RLS enabled and forced, and authenticated can only select', async () => {
    const t = await sql(`select relrowsecurity rls, relforcerowsecurity f from pg_class where oid = 'data.tickets'::regclass`)
    expect(t.rows[0]).toEqual({ rls: true, f: true })
    for (const priv of ['insert', 'update', 'delete']) {
      for (const role of ['authenticated', 'anon', 'service_role']) {
        expect((await sql(`select has_table_privilege($1, 'data.tickets', $2) ok`, [role, priv])).rows[0].ok, `${role} ${priv}`).toBe(false)
      }
    }
    expect((await sql(`select has_table_privilege('authenticated', 'data.tickets', 'select') ok`)).rows[0].ok).toBe(true)
  })

  it('a member of X cannot insert a ticket row for Y, or for X', async () => {
    const x = await mkClient()
    const y = await mkClient()
    const member = await mkMember(x.id)
    const c = await pool.connect()
    try {
      for (const target of [y.id, x.id]) {
        await c.query('begin')
        await c.query('set local role authenticated')
        await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: member.userId, role: 'authenticated', client_id: x.id })])
        await expect(c.query(`insert into data.tickets (client_id, subject, body) values ($1, 's', 'b')`, [target])).rejects.toMatchObject({ code: '42501' })
        await c.query('rollback')
      }
    } finally {
      c.release()
    }
    expect((await sql(`select count(*)::int n from data.tickets where client_id = any($1::uuid[])`, [[x.id, y.id]])).rows[0].n).toBe(0)
  })
})

describe('api.ticket_create / api.tickets_v1', () => {
  it('records the row under the caller\'s workspace and returns id + slug; the other workspace sees nothing', async () => {
    const x = await mkClient()
    const y = await mkClient()
    const a = await mkMember(x.id)
    const b = await mkMember(y.id)

    const made1 = await a.api.rpc('ticket_create', { p_subject: '  Sync is stuck ', p_body: 'line 1\nline 2', p_severity: 'urgent' })
    expect(made1.error).toBeNull()
    expect(made1.data).toHaveLength(1)
    expect(made1.data[0].client_slug).toBe(x.slug)
    const row = (await sql(`select client_id, created_by, subject, body, severity, status from data.tickets where id = $1`, [made1.data[0].id])).rows[0]
    expect(row).toEqual({ client_id: x.id, created_by: a.userId, subject: 'Sync is stuck', body: 'line 1\nline 2', severity: 'urgent', status: 'open' })

    // X's member reads it, Y's member does not (view and RPC-free direct read both scoped by RLS).
    const own = await a.api.from('tickets_v1').select('id,subject,status')
    expect(own.data).toEqual([{ id: made1.data[0].id, subject: 'Sync is stuck', status: 'open' }])
    const other = await b.api.from('tickets_v1').select('id')
    expect(other.error).toBeNull()
    expect(other.data).toEqual([])

    // Y's own ticket never lands in X, whatever X's member sends: there is no client argument.
    const spoof = await b.api.rpc('ticket_create', { p_subject: 's', p_body: 'b', client_id: x.id })
    expect(spoof.error).not.toBeNull()
    const made2 = await b.api.rpc('ticket_create', { p_subject: 'from Y', p_body: 'b' })
    expect(made2.data[0].client_slug).toBe(y.slug)
    expect((await sql(`select client_id from data.tickets where id = $1`, [made2.data[0].id])).rows[0].client_id).toBe(y.id)
    expect((await a.api.from('tickets_v1').select('id')).data).toHaveLength(1)
  })

  it('a token with no workspace gets BCNS0 and writes nothing', async () => {
    const x = await mkClient()
    const { data } = await serviceClient().auth.admin.createUser({ email: `tk-${randomUUID().slice(0, 8)}@example.test`, password: 'password-tk', email_confirm: true })
    users.push(data.user!.id)
    const api = clientWithToken(await mintJwt(data.user!.id))
    const r = await api.rpc('ticket_create', { p_subject: 's', p_body: 'b' })
    expect(r.error?.code).toBe('BCNS0')
    expect((await sql(`select count(*)::int n from data.tickets where client_id = $1`, [x.id])).rows[0].n).toBe(0)
  })

  it('validates subject, body and severity (BCNS3, detail names the field)', async () => {
    const x = await mkClient()
    const { api } = await mkMember(x.id)
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ p_subject: '   ', p_body: 'b' }, 'subject'],
      [{ p_subject: 'a\nb', p_body: 'b' }, 'subject'],
      [{ p_subject: 'x'.repeat(121), p_body: 'b' }, 'subject'],
      [{ p_subject: 's', p_body: '' }, 'body'],
      [{ p_subject: 's', p_body: 'x'.repeat(4001) }, 'body'],
      [{ p_subject: 's', p_body: 'b', p_severity: 'critical' }, 'severity'],
    ]
    for (const [args, field] of cases) {
      const r = await api.rpc('ticket_create', args)
      expect(r.error?.code, JSON.stringify(args).slice(0, 60)).toBe('BCNS3')
      expect(r.error?.details, field).toBe(field)
    }
    const edge = await api.rpc('ticket_create', { p_subject: 'x'.repeat(120), p_body: 'x'.repeat(4000), p_severity: 'low' })
    expect(edge.error).toBeNull()
    expect((await sql(`select count(*)::int n from data.tickets where client_id = $1`, [x.id])).rows[0].n).toBe(1)
  })

  it('refuses the 11th ticket of a workspace within an hour, and only that workspace', async () => {
    const x = await mkClient()
    const y = await mkClient()
    const a = await mkMember(x.id)
    const b = await mkMember(y.id)
    await sql(`insert into data.tickets (client_id, subject, body) select $1, 's' || g, 'b' from generate_series(1, 10) g`, [x.id])
    const refused = await a.api.rpc('ticket_create', { p_subject: 'one more', p_body: 'b' })
    expect(refused.error?.code).toBe('BCNS9')
    expect((await b.api.rpc('ticket_create', { p_subject: 'fine', p_body: 'b' })).error).toBeNull()
    await sql(`update data.tickets set created_at = now() - interval '2 hours' where client_id = $1`, [x.id])
    expect((await a.api.rpc('ticket_create', { p_subject: 'later', p_body: 'b' })).error).toBeNull()
  })
})
