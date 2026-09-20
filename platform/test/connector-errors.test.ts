// Why these exist: a Shopify auth rejection arrives as `{"errors": "<sentence>"}`, not the
// GraphQL array. Reading errors[0].message on a string gives a character with no .message,
// so every such failure was recorded as the literal 'graphql error' and the real cause was
// lost — it is never persisted, only e.message reaches connector_runs/source_tokens.
import { describe, expect, it } from 'vitest'
import { SourceError, classify, reason } from '../worker/src/connectors/index.js'

describe('reason', () => {
  it('reads a bare-string errors body, the shape that produced "graphql error"', () => {
    const body = { errors: '[API] Invalid API key or access token' }
    expect(reason(body, 401)).toBe('HTTP 401: [API] Invalid API key or access token')
  })

  it('reads the GraphQL array shape', () => {
    const body = { errors: [{ message: 'Access denied for field.', extensions: { code: 'ACCESS_DENIED' } }] }
    expect(reason(body, 200)).toBe('HTTP 200: Access denied for field.')
  })

  it("reads Meta's singular error object", () => {
    expect(reason({ error: { message: 'Session has expired', code: 190 } }, 400)).toBe('HTTP 400: Session has expired')
  })

  it("reads Google's error_description", () => {
    expect(reason({ error: { error_description: 'Token has been expired or revoked.' } }, 400))
      .toBe('HTTP 400: Token has been expired or revoked.')
  })

  it('falls back to a body snippet rather than a bare label when no message exists', () => {
    const out = reason({ errors: [{ extensions: { code: 'THROTTLED' } }] }, 200)
    expect(out).toContain('THROTTLED')
    expect(out).not.toBe('graphql error')
  })

  it('still carries the status when the body has nothing at all', () => {
    expect(reason({}, 503)).toBe('HTTP 503')
    expect(reason(undefined, 503)).toBe('HTTP 503')
  })

  it('keeps the reason readable through SourceError', () => {
    const e = new SourceError('shopify', reason({ errors: 'bad token' }, 401), 401, { errors: 'bad token' })
    expect(e.message).toBe('HTTP 401: bad token')
  })
})

describe('classify — a plain 401 is auth for every source', () => {
  // Before the hoist only shopify and meet/drive checked the status. Monday and
  // meta matched body text alone, so a revoked token returning a bare 401 was
  // classified 'error': source_tokens stayed 'active', the card read "Error"
  // instead of "Reconnect needed", and refresh never ran.
  for (const source of ['shopify', 'monday', 'meta', 'meet', 'drive'] as const) {
    it(`${source}: 401 with an unrecognised body`, () => {
      expect(classify(new SourceError(source, 'HTTP 401: nope', 401, { errors: 'nope' }))).toBe('auth')
    })
  }

  it('leaves each provider-specific signal working', () => {
    expect(classify(new SourceError('shopify', 'x', 200, { errors: [{ extensions: { code: 'ACCESS_DENIED' } }] }))).toBe('auth')
    expect(classify(new SourceError('monday', 'x', 200, { errors: [{ message: 'USER_UNAUTHORIZED' }] }))).toBe('auth')
    expect(classify(new SourceError('meta', 'x', 400, { error: { code: 190 } }))).toBe('auth')
    expect(classify(new SourceError('drive', 'x', 400, { error: { error_description: 'invalid_grant' } }))).toBe('auth')
  })

  it('does not turn a throttle or an ordinary failure into auth', () => {
    expect(classify(new SourceError('shopify', 'x', 429, {}))).toBe('throttle')
    expect(classify(new SourceError('shopify', 'x', 200, { errors: [{ extensions: { code: 'THROTTLED' } }] }))).toBe('throttle')
    expect(classify(new SourceError('drive', 'x', 403, { error: { message: 'userRateLimitExceeded' } }))).toBe('throttle')
    expect(classify(new SourceError('monday', 'x', 500, { errors: 'boom' }))).toBe('error')
  })
})

describe('classify — shopify 403', () => {
  it("treats 403 as auth: the Admin API's rejection for a non-expiring token", () => {
    expect(classify(new SourceError('shopify', 'HTTP 403', 403, { errors: 'Invalid API key or access token' }))).toBe('auth')
  })

  it('stays shopify-only, so one forbidden resource elsewhere is not a dead credential', () => {
    for (const source of ['monday', 'meta', 'meet', 'drive'] as const) {
      expect(classify(new SourceError(source, 'HTTP 403', 403, { error: { message: 'forbidden' } }))).toBe('error')
    }
  })

  it('does not shadow the drive/meet 403 throttle', () => {
    expect(classify(new SourceError('drive', 'x', 403, { error: { message: 'userRateLimitExceeded' } }))).toBe('throttle')
  })
})
