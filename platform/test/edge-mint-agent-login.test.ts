// mint-agent-login Edge Function: mirrors `scripts/add-member.ts --agent`.
// Same shape as edge-invite-member.test.ts — pure handler, injected deps.
import { describe, expect, it } from 'vitest'
import {
  agentEmail,
  handle,
  randomPassword,
  type MintDeps,
} from '../supabase/functions/mint-agent-login/handler.ts'

const CLIENT_A = 'a0000000-0000-4000-8000-000000000001'
const OWNER = '11111111-1111-4111-8111-111111111111'
const AGENT = '33333333-3333-4333-8333-333333333333'

interface Recorded {
  memberships: Array<{ userId: string; clientId: string; role: string; isSmoke: boolean }>
  upserts: Array<{ email: string; password: string }>
  slugLookups: string[]
}

function deps(
  over: Partial<MintDeps> & { role?: string | null; slug?: string | null; upsertFails?: boolean } = {},
): { deps: MintDeps; rec: Recorded } {
  const rec: Recorded = { memberships: [], upserts: [], slugLookups: [] }
  const role = over.role === undefined ? 'owner' : over.role
  const base: MintDeps = {
    getUser: async (token) => (token === 'good' ? { userId: OWNER, email: 'owner@acme.example' } : null),
    getMembership: async () => (role === null ? null : { clientId: CLIENT_A, role }),
    getClientSlug: async (clientId) => {
      rec.slugLookups.push(clientId)
      return over.slug === undefined ? 'acme' : over.slug
    },
    upsertUser: async (email, password) => {
      rec.upserts.push({ email, password })
      return over.upsertFails ? { userId: null, error: 'not_an_agent_user' } : { userId: AGENT }
    },
    insertMembership: async (userId, clientId, memberRole, isSmoke) => {
      rec.memberships.push({ userId, clientId, role: memberRole, isSmoke })
    },
    randomPassword: () => 'p'.repeat(32),
  }
  return { deps: { ...base, ...over }, rec }
}

function post(body: unknown = {}, token: string | null = 'good'): Request {
  return new Request('https://p.supabase.co/functions/v1/mint-agent-login', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  })
}

describe('mint-agent-login', () => {
  it('no Authorization header is 401 and mints nothing', async () => {
    const { deps: d, rec } = deps()
    expect((await handle(post({}, null), d)).status).toBe(401)
    expect(rec.upserts).toEqual([])
  })

  it('a member who is not an owner is 403 and mints nothing', async () => {
    const { deps: d, rec } = deps({ role: 'member' })
    const res = await handle(post(), d)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden_role' })
    expect(rec.upserts).toEqual([])
    expect(rec.memberships).toEqual([])
  })

  it('no membership at all is 403', async () => {
    const { deps: d } = deps({ role: null })
    expect((await handle(post(), d)).status).toBe(403)
  })

  it('happy path returns the agent address and the password exactly once', async () => {
    const { deps: d, rec } = deps()
    const res = await handle(post(), d)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ email: 'agent+acme@bcn-services.com', password: 'p'.repeat(32) })
    expect(rec.upserts).toEqual([{ email: agentEmail('acme'), password: 'p'.repeat(32) }])
  })

  it('the membership is always member / is_smoke false, on the caller own client', async () => {
    const { deps: d, rec } = deps()
    await handle(post({ client_id: 'b0000000-0000-4000-8000-000000000001', role: 'owner', slug: 'beta' }), d)
    expect(rec.memberships).toEqual([{ userId: AGENT, clientId: CLIENT_A, role: 'member', isSmoke: false }])
    // The slug is looked up from the caller's client id, so the body cannot retarget it.
    expect(rec.slugLookups).toEqual([CLIENT_A])
  })

  it('a client with no slug is 500 rather than agent+null@', async () => {
    const { deps: d, rec } = deps({ slug: null })
    expect((await handle(post(), d)).status).toBe(500)
    expect(rec.upserts).toEqual([])
  })

  it('a refused rotation is 502 and writes no membership', async () => {
    const { deps: d, rec } = deps({ upsertFails: true })
    const res = await handle(post(), d)
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'not_an_agent_user' })
    expect(rec.memberships).toEqual([])
  })

  it('GET is 405', async () => {
    const { deps: d } = deps()
    expect((await handle(new Request('https://p/functions/v1/mint-agent-login'), d)).status).toBe(405)
  })

  it('randomPassword is 32 chars from the CSPRNG and does not repeat', () => {
    const a = randomPassword()
    expect(a).toHaveLength(32)
    expect(a).toMatch(/^[A-Za-z0-9]{32}$/)
    expect(new Set(Array.from({ length: 20 }, randomPassword)).size).toBe(20)
  })
})
