// invite-member Edge Function: the policy, with every side effect injected.
// These run on node under the normal platform suite — no Deno, no database, no
// service-role key. The one rule worth a test each: the client id comes from
// the CALLER'S membership, never from the request body.
import { describe, expect, it } from 'vitest'
import { handle, INVITE_REDIRECT, type InviteDeps } from '../supabase/functions/invite-member/handler.ts'

const CLIENT_A = 'a0000000-0000-4000-8000-000000000001'
const CLIENT_B = 'b0000000-0000-4000-8000-000000000001'
const OWNER = '11111111-1111-4111-8111-111111111111'
const NEW_USER = '22222222-2222-4222-8222-222222222222'

interface Recorded {
  memberships: Array<{ userId: string; clientId: string; role: string }>
  invites: Array<{ email: string; redirectTo: string }>
  lookups: string[]
}

function deps(
  over: Partial<InviteDeps> & { role?: string | null; inviteFails?: boolean; existingUserId?: string | null } = {},
): { deps: InviteDeps; rec: Recorded } {
  const rec: Recorded = { memberships: [], invites: [], lookups: [] }
  const role = over.role === undefined ? 'owner' : over.role
  const base: InviteDeps = {
    getUser: async (token) => (token === 'good' ? { userId: OWNER, email: 'owner@acme.example' } : null),
    getMembership: async () => (role === null ? null : { clientId: CLIENT_A, role }),
    inviteUser: async (email, redirectTo) => {
      rec.invites.push({ email, redirectTo })
      return over.inviteFails ? { userId: null, error: 'User already registered' } : { userId: NEW_USER }
    },
    findUserByEmail: async (email) => {
      rec.lookups.push(email)
      return over.existingUserId === undefined ? NEW_USER : over.existingUserId
    },
    insertMembership: async (userId, clientId, memberRole) => {
      rec.memberships.push({ userId, clientId, role: memberRole })
    },
  }
  return { deps: { ...base, ...over }, rec }
}

function post(body: unknown, token: string | null = 'good'): Request {
  return new Request('https://p.supabase.co/functions/v1/invite-member', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  })
}

describe('invite-member', () => {
  it('no Authorization header is 401 and touches nothing', async () => {
    const { deps: d, rec } = deps()
    const res = await handle(post({ email: 'new@acme.example' }, null), d)
    expect(res.status).toBe(401)
    expect(rec.invites).toEqual([])
    expect(rec.memberships).toEqual([])
  })

  it('a token the auth server rejects is 401', async () => {
    const { deps: d } = deps()
    expect((await handle(post({ email: 'new@acme.example' }, 'forged'), d)).status).toBe(401)
  })

  it('a verified caller with no membership is 403', async () => {
    const { deps: d, rec } = deps({ role: null })
    expect((await handle(post({ email: 'new@acme.example' }), d)).status).toBe(403)
    expect(rec.memberships).toEqual([])
  })

  it('a member who is not an owner is 403 and invites nobody', async () => {
    const { deps: d, rec } = deps({ role: 'member' })
    const res = await handle(post({ email: 'new@acme.example' }), d)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden_role' })
    expect(rec.invites).toEqual([])
    expect(rec.memberships).toEqual([])
  })

  it('an invalid email is 400, checked after the caller but before any write', async () => {
    const { deps: d, rec } = deps()
    for (const email of ['', 'nope', 'a@b', 42, undefined]) {
      const res = await handle(post({ email }), d)
      expect(res.status, String(email)).toBe(400)
    }
    expect(rec.invites).toEqual([])
    expect(rec.memberships).toEqual([])
  })

  it('happy path: invites with the hub redirect and adds the membership as a member', async () => {
    const { deps: d, rec } = deps()
    const res = await handle(post({ email: 'New@Acme.example' }), d)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, userId: NEW_USER, invited: true })
    expect(rec.invites).toEqual([{ email: 'new@acme.example', redirectTo: INVITE_REDIRECT }])
    expect(rec.memberships).toEqual([{ userId: NEW_USER, clientId: CLIENT_A, role: 'member' }])
  })

  it('an owner of A cannot invite into B: the body client_id is ignored', async () => {
    const { deps: d, rec } = deps()
    const res = await handle(post({ email: 'new@acme.example', client_id: CLIENT_B, role: 'owner' }), d)
    expect(res.status).toBe(200)
    expect(rec.memberships).toEqual([{ userId: NEW_USER, clientId: CLIENT_A, role: 'member' }])
  })

  it('re-inviting an existing account still attaches the membership', async () => {
    const { deps: d, rec } = deps({ inviteFails: true })
    const res = await handle(post({ email: 'new@acme.example' }), d)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ invited: false })
    expect(rec.lookups).toEqual(['new@acme.example'])
    expect(rec.memberships).toEqual([{ userId: NEW_USER, clientId: CLIENT_A, role: 'member' }])
  })

  it('an invite that fails with no account behind it is 502, not a silent success', async () => {
    const { deps: d, rec } = deps({ inviteFails: true, existingUserId: null })
    const res = await handle(post({ email: 'new@acme.example' }), d)
    expect(res.status).toBe(502)
    expect(rec.memberships).toEqual([])
  })

  it('GET is 405', async () => {
    const { deps: d } = deps()
    const res = await handle(new Request('https://p/functions/v1/invite-member'), d)
    expect(res.status).toBe(405)
  })
})
