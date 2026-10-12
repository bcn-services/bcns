// refreshGoogleToken client-credential selection (connectors/google.ts). No DB: fake fetch, env set/restored per test.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SourceError, type RunContext, type Source } from '../worker/src/connectors/index.js'
import { refreshGoogleToken } from '../worker/src/connectors/google.js'

const ENV_ID = 'bcns-client-id', ENV_SECRET = 'bcns-client-secret'
const saved = { id: process.env.GOOGLE_CLIENT_ID, secret: process.env.GOOGLE_CLIENT_SECRET }
const restore = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v }
beforeEach(() => { process.env.GOOGLE_CLIENT_ID = ENV_ID; process.env.GOOGLE_CLIENT_SECRET = ENV_SECRET })
afterEach(() => { restore('GOOGLE_CLIENT_ID', saved.id); restore('GOOGLE_CLIENT_SECRET', saved.secret) })

function setup(config: Record<string, unknown>, attributes?: Record<string, unknown>) {
  const bodies: URLSearchParams[] = []
  const fetch = (async (_url: unknown, init?: { body?: string }) => {
    bodies.push(new URLSearchParams(init?.body))
    return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 }))
  }) as unknown as typeof globalThis.fetch
  const ctx = ({
    clientId: 'c1', source: 'drive' as Source, config, timezone: 'UTC', fetch,
    token: { secret: 'old', refresh_secret: 'rt', attributes },
  }) as unknown as RunContext
  return { ctx, bodies }
}

describe('refreshGoogleToken credentials', () => {
  it('operator row: sends its own id + attributes secret, never env', async () => {
    const { ctx, bodies } = setup({ oauth_client_id: 'sb-id' }, { oauth_client_secret: 'sb-secret' })
    expect((await refreshGoogleToken(ctx, 'drive')).secret).toBe('at')
    expect(bodies).toHaveLength(1)
    expect(Object.fromEntries(bodies[0])).toEqual({
      grant_type: 'refresh_token', refresh_token: 'rt', client_id: 'sb-id', client_secret: 'sb-secret',
    })
  })

  it('operator row keeps the attributes secret even when its id is the env id, and without a config id (byte-identical)', async () => {
    const a = setup({ oauth_client_id: ENV_ID }, { oauth_client_secret: 'own' })
    await refreshGoogleToken(a.ctx, 'drive')
    expect(a.bodies[0].get('client_secret')).toBe('own')
    const b = setup({}, { oauth_client_secret: 'own' })
    await refreshGoogleToken(b.ctx, 'drive')
    expect(b.bodies[0].get('client_id')).toBe('')
    expect(b.bodies[0].get('client_secret')).toBe('own')
  })

  it('hub row (id = env id, no secret): sends the env secret', async () => {
    const { ctx, bodies } = setup({ oauth_client_id: ENV_ID })
    await refreshGoogleToken(ctx, 'meet')
    expect(bodies[0].get('client_id')).toBe(ENV_ID)
    expect(bodies[0].get('client_secret')).toBe(ENV_SECRET)
  })

  it('config id absent: env id and env secret are used', async () => {
    const { ctx, bodies } = setup({})
    await refreshGoogleToken(ctx, 'drive')
    expect(bodies[0].get('client_id')).toBe(ENV_ID)
    expect(bodies[0].get('client_secret')).toBe(ENV_SECRET)
  })

  it('empty-string attributes secret counts as unset', async () => {
    const { ctx, bodies } = setup({ oauth_client_id: ENV_ID }, { oauth_client_secret: '' })
    await refreshGoogleToken(ctx, 'drive')
    expect(bodies[0].get('client_secret')).toBe(ENV_SECRET)
  })

  it('a different client id and no secret: refused, no fetch, message leaks no value', async () => {
    const { ctx, bodies } = setup({ oauth_client_id: 'someone-elses-id' })
    const err = await refreshGoogleToken(ctx, 'drive').catch(e => e)
    expect(err).toBeInstanceOf(SourceError)
    expect(err.status).toBeUndefined()
    expect(err.message).toMatch(/GOOGLE_CLIENT_ID\/GOOGLE_CLIENT_SECRET/)
    for (const v of [ENV_ID, ENV_SECRET, 'someone-elses-id']) expect(err.message).not.toContain(v)
    expect(bodies).toHaveLength(0)
  })

  it('env unset and no secret: refused, no fetch', async () => {
    delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_CLIENT_SECRET
    for (const config of [{ oauth_client_id: ENV_ID }, {}]) {
      const { ctx, bodies } = setup(config)
      await expect(refreshGoogleToken(ctx, 'drive')).rejects.toBeInstanceOf(SourceError)
      expect(bodies).toHaveLength(0)
    }
  })

  it('env id set but env secret unset: refused, no fetch', async () => {
    delete process.env.GOOGLE_CLIENT_SECRET
    const { ctx, bodies } = setup({ oauth_client_id: ENV_ID })
    await expect(refreshGoogleToken(ctx, 'drive')).rejects.toBeInstanceOf(SourceError)
    expect(bodies).toHaveLength(0)
  })
})
