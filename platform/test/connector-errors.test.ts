// Why these exist: a Shopify auth rejection arrives as `{"errors": "<sentence>"}`, not the
// GraphQL array. Reading errors[0].message on a string gives a character with no .message,
// so every such failure was recorded as the literal 'graphql error' and the real cause was
// lost — it is never persisted, only e.message reaches connector_runs/source_tokens.
import { describe, expect, it } from 'vitest'
import { SourceError, reason } from '../worker/src/connectors/index.js'

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
