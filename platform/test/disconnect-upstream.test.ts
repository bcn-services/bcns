// Owner disconnect, upstream half without a database: revokeUpstream per source against fetch
// fixtures, and the Google sibling decision. The DB-backed flow is quickbooks-disconnect.test.ts.
import { describe, expect, it } from 'vitest'
import { SourceError } from '../worker/src/connectors/index.js'
import {
  DISCONNECT_SOURCES, GOOGLE_REVOKE_URL, INTUIT_REVOKE_URL, META_PERMISSIONS_URL,
  googleRevokeNeeded, revokeUpstream,
} from '../worker/src/disconnect.js'

interface Call { url: string; init: RequestInit }
function fx(respond: () => Response | Promise<Response>) {
  const calls: Call[] = []
  const f = (async (url: string, init: RequestInit) => { calls.push({ url: String(url), init }); return respond() }) as typeof fetch
  return { f, calls }
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const TOKEN = { secret: 'access-tok', refresh_secret: 'refresh-tok' }
const QB_ENV = { QUICKBOOKS_CLIENT_ID: 'qb-id', QUICKBOOKS_CLIENT_SECRET: 'qb-secret' }

describe('constants', () => {
  it('pins the endpoints and the allow-list to literals', () => {
    expect(INTUIT_REVOKE_URL).toBe('https://developer.api.intuit.com/v2/oauth2/tokens/revoke')
    expect(GOOGLE_REVOKE_URL).toBe('https://oauth2.googleapis.com/revoke')
    expect(META_PERMISSIONS_URL).toBe('https://graph.facebook.com/v21.0/me/permissions')
    expect([...DISCONNECT_SOURCES].sort()).toEqual(['drive', 'meet', 'meta', 'monday', 'quickbooks'])
  })
})

describe('revokeUpstream: quickbooks', () => {
  it('POSTs the refresh token to Intuit with Basic app credentials', async () => {
    const { f, calls } = fx(() => new Response('', { status: 200 }))
    expect(await revokeUpstream(f, 'quickbooks', TOKEN, QB_ENV)).toBe('revoked')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://developer.api.intuit.com/v2/oauth2/tokens/revoke')
    expect(calls[0].init.method).toBe('POST')
    const h = calls[0].init.headers as Record<string, string>
    expect(h.Authorization).toBe(`Basic ${Buffer.from('qb-id:qb-secret').toString('base64')}`)
    expect(h['content-type']).toBe('application/json')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ token: 'refresh-tok' })
  })
  it('falls back to the access token', async () => {
    const { f, calls } = fx(() => new Response('', { status: 200 }))
    await revokeUpstream(f, 'quickbooks', { secret: 'access-tok', refresh_secret: null }, QB_ENV)
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ token: 'access-tok' })
  })
  it('400 invalid_grant is already_invalid; 401 invalid_client throws', async () => {
    expect(await revokeUpstream(fx(() => json(400, { error: 'invalid_grant' })).f, 'quickbooks', TOKEN, QB_ENV)).toBe('already_invalid')
    await expect(revokeUpstream(fx(() => json(401, { error: 'invalid_client' })).f, 'quickbooks', TOKEN, QB_ENV)).rejects.toBeInstanceOf(SourceError)
  })
  it('missing app credentials: throws before any call', async () => {
    const { f, calls } = fx(() => new Response('', { status: 200 }))
    await expect(revokeUpstream(f, 'quickbooks', TOKEN, { QUICKBOOKS_CLIENT_ID: 'qb-id' })).rejects.toThrow(/QUICKBOOKS_CLIENT_SECRET/)
    expect(calls).toHaveLength(0)
  })
})

describe.each(['meet', 'drive'] as const)('revokeUpstream: %s (Google)', source => {
  it('POSTs the refresh token form-encoded to Google, no client secret', async () => {
    const { f, calls } = fx(() => new Response('', { status: 200 }))
    expect(await revokeUpstream(f, source, TOKEN, {})).toBe('revoked')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://oauth2.googleapis.com/revoke')
    expect(calls[0].init.method).toBe('POST')
    expect((calls[0].init.headers as Record<string, string>)['content-type']).toBe('application/x-www-form-urlencoded')
    expect(String(calls[0].init.body)).toBe('token=refresh-tok')
    expect(String(calls[0].init.body)).not.toMatch(/secret|client/)
  })
  it('falls back to the access token', async () => {
    const { f, calls } = fx(() => new Response('', { status: 200 }))
    await revokeUpstream(f, source, { secret: 'access-tok', refresh_secret: null }, {})
    expect(String(calls[0].init.body)).toBe('token=access-tok')
  })
  it('400 invalid_token is already_invalid', async () => {
    expect(await revokeUpstream(fx(() => json(400, { error: 'invalid_token', error_description: 'Token expired or revoked' })).f, source, TOKEN, {}))
      .toBe('already_invalid')
  })
  it('any other answer throws a SourceError with its status', async () => {
    for (const [status, body] of [[400, { error: 'invalid_request' }], [401, { error: 'unauthorized_client' }], [503, {}]] as const) {
      const err = await revokeUpstream(fx(() => json(status, body)).f, source, TOKEN, {}).catch(e => e)
      expect(err).toBeInstanceOf(SourceError)
      expect(err.status).toBe(status)
    }
  })
})

describe('revokeUpstream: meta', () => {
  it('DELETEs /me/permissions with the user token as access_token', async () => {
    const { f, calls } = fx(() => json(200, { success: true }))
    expect(await revokeUpstream(f, 'meta', TOKEN, {})).toBe('revoked')
    expect(calls).toHaveLength(1)
    const u = new URL(calls[0].url)
    expect(`${u.origin}${u.pathname}`).toBe('https://graph.facebook.com/v21.0/me/permissions')
    expect(u.searchParams.get('access_token')).toBe('access-tok')
    expect(calls[0].init.method).toBe('DELETE')
  })
  it('OAuth error 190 is already_invalid; other errors and success:false throw', async () => {
    expect(await revokeUpstream(fx(() => json(400, { error: { code: 190, message: 'Session has expired' } })).f, 'meta', TOKEN, {})).toBe('already_invalid')
    await expect(revokeUpstream(fx(() => json(400, { error: { code: 100, message: 'bad' } })).f, 'meta', TOKEN, {})).rejects.toBeInstanceOf(SourceError)
    await expect(revokeUpstream(fx(() => json(500, { error: { code: 1, message: 'down' } })).f, 'meta', TOKEN, {})).rejects.toBeInstanceOf(SourceError)
    await expect(revokeUpstream(fx(() => json(200, { success: false })).f, 'meta', TOKEN, {})).rejects.toBeInstanceOf(SourceError)
  })
})

describe('revokeUpstream: monday', () => {
  it('has no revoke endpoint: no call, none', async () => {
    const { f, calls } = fx(() => new Response('', { status: 200 }))
    expect(await revokeUpstream(f, 'monday', TOKEN, {})).toBe('none')
    expect(calls).toHaveLength(0)
  })
})

describe('googleRevokeNeeded (the other Google source)', () => {
  it('revokes when the sibling is absent or revoked for any reason', () => {
    expect(googleRevokeNeeded(null)).toBe(true)
    expect(googleRevokeNeeded(undefined)).toBe(true)
    expect(googleRevokeNeeded({ status: 'revoked' })).toBe(true) // owner_disconnect or an operator's revoke
  })
  it('keeps the grant only while the sibling is live: active or auth_failed', () => {
    expect(googleRevokeNeeded({ status: 'active' })).toBe(false)
    expect(googleRevokeNeeded({ status: 'auth_failed' })).toBe(false)
  })
})
