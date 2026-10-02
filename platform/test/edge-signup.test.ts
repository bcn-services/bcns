// signup Edge Function: the policy with every side effect injected (no Deno, no DB, no keys).
// What matters: an existing address and a capped window answer exactly like a fresh sign-up and
// create / send nothing; a failed second step leaves no orphan auth user.
import { describe, expect, it } from 'vitest'
import { ACCEPTED, handle, SIGNUP_REDIRECT, type SignupDeps } from '../supabase/functions/signup/handler.ts'

const NEW_USER = '33333333-3333-4333-8333-333333333333'

interface Recorded {
  users: Array<{ email: string }>
  argCounts: number[]
  clients: Array<{ userId: string; name: string }>
  deleted: string[]
  mails: Array<{ email: string; redirectTo: string }>
  logs: Array<{ event: string; data: Record<string, unknown> }>
}

function deps(
  over: { exists?: boolean; rpcCode?: string; deleteFails?: boolean; enabled?: boolean; mailThrows?: boolean } = {},
): { deps: SignupDeps; rec: Recorded } {
  const rec: Recorded = { users: [], argCounts: [], clients: [], deleted: [], mails: [], logs: [] }
  const d: SignupDeps = {
    enabled: over.enabled ?? true,
    createUser: async (...args) => {
      const [email] = args
      rec.argCounts.push(args.length)
      rec.users.push({ email })
      return over.exists ? { userId: null, error: 'email_exists' } : { userId: NEW_USER }
    },
    createClient: async (userId, name) => {
      rec.clients.push({ userId, name })
      if (over.rpcCode) throw Object.assign(new Error('rpc failed'), { code: over.rpcCode })
      return 'acme-bakery'
    },
    deleteUser: async (userId) => {
      if (over.deleteFails) throw new Error('nope')
      rec.deleted.push(userId)
    },
    sendConfirmation: async (email, redirectTo) => {
      rec.mails.push({ email, redirectTo })
      if (over.mailThrows) throw new Error('smtp down')
      return {}
    },
    log: (event, data) => rec.logs.push({ event, data }),
  }
  return { deps: d, rec }
}

const GOOD = { name: 'Acme Bakery', email: 'Owner@Acme.example ' }

function post(body: unknown, method = 'POST'): Request {
  return new Request('https://p.supabase.co/functions/v1/signup', {
    method,
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  })
}

async function read(res: Response) {
  return { status: res.status, body: await res.text() }
}

describe('signup', () => {
  it('fresh sign-up: user, then pending client, then one confirmation mail to the hub confirm route', async () => {
    const { deps: d, rec } = deps()
    const res = await read(await handle(post(GOOD), d))
    expect(res).toEqual({ status: 200, body: JSON.stringify(ACCEPTED) })
    expect(rec.users).toEqual([{ email: 'owner@acme.example' }])
    expect(rec.clients).toEqual([{ userId: NEW_USER, name: 'Acme Bakery' }])
    expect(rec.mails).toEqual([{ email: 'owner@acme.example', redirectTo: SIGNUP_REDIRECT }])
    expect(SIGNUP_REDIRECT).toBe('https://connect.bcn-services.com/auth/confirm')
    expect(rec.deleted).toEqual([])
  })

  it('takes no password: createUser gets the email only, and a body that still carries one is accepted and ignored', async () => {
    for (const password of [undefined, 'short', 'x'.repeat(100), 'correct-horse', 42]) {
      const { deps: d, rec } = deps()
      const res = await read(await handle(post(password === undefined ? GOOD : { ...GOOD, password }), d))
      expect(res).toEqual({ status: 200, body: JSON.stringify(ACCEPTED) })
      expect(rec.users).toEqual([{ email: 'owner@acme.example' }])
      expect(rec.argCounts).toEqual([1])
      expect(JSON.stringify(rec)).not.toContain('correct-horse')
    }
  })

  it('switch off (SIGNUP_ENABLED unset): 404 for any request, no dependency called', async () => {
    for (const req of [post(GOOD), post(null, 'GET')]) {
      const { deps: d, rec } = deps({ enabled: false })
      const res = await handle(req, d)
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'not_found' })
      expect(rec).toEqual({ users: [], argCounts: [], clients: [], deleted: [], mails: [], logs: [] })
    }
  })

  it('an address that already has an account creates nothing, re-sends the confirmation, and answers identically', async () => {
    const fresh = await read(await handle(post(GOOD), deps().deps))
    const { deps: d, rec } = deps({ exists: true })
    const again = await read(await handle(post(GOOD), d))
    expect(again).toEqual(fresh)
    expect(rec.clients).toEqual([])
    expect(rec.deleted).toEqual([])
    expect(rec.mails).toEqual([{ email: 'owner@acme.example', redirectTo: SIGNUP_REDIRECT }])
    // The log never carries the address.
    expect(JSON.stringify(rec.logs)).not.toContain('acme.example')
  })

  it('an existing address whose re-send throws still answers identically', async () => {
    const fresh = await read(await handle(post(GOOD), deps().deps))
    const { deps: d, rec } = deps({ exists: true, mailThrows: true })
    expect(await read(await handle(post(GOOD), d))).toEqual(fresh)
    expect(rec.clients).toEqual([])
    expect(rec.logs.map((l) => l.event)).toContain('signup_resend_failed')
  })

  it('a failed client step deletes the new auth user (no orphan) and sends no mail', async () => {
    const { deps: d, rec } = deps({ rpcCode: '23505' })
    const res = await handle(post(GOOD), d)
    expect(res.status).toBe(502)
    expect(rec.deleted).toEqual([NEW_USER])
    expect(rec.mails).toEqual([])
  })

  it('the hourly cap (BCNS8) deletes the user, sends no mail, and still answers like success', async () => {
    const fresh = await read(await handle(post(GOOD), deps().deps))
    const { deps: d, rec } = deps({ rpcCode: 'BCNS8' })
    expect(await read(await handle(post(GOOD), d))).toEqual(fresh)
    expect(rec.deleted).toEqual([NEW_USER])
    expect(rec.mails).toEqual([])
  })

  it('a delete that fails is logged by user id', async () => {
    const { deps: d, rec } = deps({ rpcCode: 'XX000', deleteFails: true })
    await handle(post(GOOD), d)
    expect(rec.logs.map((l) => l.event)).toContain('signup_orphan_user')
  })

  it('malformed input is 400 and touches nothing', async () => {
    for (const [body, error] of [
      [{ ...GOOD, name: '  ' }, 'invalid_name'],
      [{ ...GOOD, name: 'x'.repeat(101) }, 'invalid_name'],
      [{ ...GOOD, email: 'not-an-email' }, 'invalid_email'],
      [null, 'invalid_name'],
    ] as const) {
      const { deps: d, rec } = deps()
      const res = await handle(post(body), d)
      expect(res.status, error).toBe(400)
      expect(await res.json()).toEqual({ error })
      expect(rec.users).toEqual([])
    }
  })

  it('non-POST is 405', async () => {
    const { deps: d, rec } = deps()
    expect((await handle(post(null, 'GET'), d)).status).toBe(405)
    expect(rec.users).toEqual([])
  })
})
