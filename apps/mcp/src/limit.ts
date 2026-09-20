// Per-token fixed-window rate limit.
import { createHash } from 'node:crypto'

export const DEFAULT_LIMIT = 60
export const WINDOW_MS = 60_000

/** Tokens are secrets; the counter is keyed by their digest so no JWT sits in a Map key. */
function key(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface RateLimiter {
  /** True while the caller is under its budget for the current window. */
  allow(token: string, now?: number): boolean
}

// ponytail: in-memory, single process. A second process serving /mcp doubles the effective
// limit and a restart forgets every counter. Move the window to Postgres or Redis the day
// there is more than one process.
export function createRateLimiter(limit = DEFAULT_LIMIT, windowMs = WINDOW_MS): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>()

  return {
    allow(token, now = Date.now()) {
      const k = key(token)
      const seen = windows.get(k)
      if (!seen || now - seen.start >= windowMs) {
        // An unverified token still gets an entry, so prune expired windows before growing.
        if (windows.size > 10_000) {
          for (const [other, w] of windows) if (now - w.start >= windowMs) windows.delete(other)
        }
        windows.set(k, { start: now, count: 1 })
        return true
      }
      seen.count += 1
      return seen.count <= limit
    },
  }
}

/** MCP_RATE_LIMIT_PER_MIN overrides the default; anything unparseable falls back to it. */
export function limitFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.MCP_RATE_LIMIT_PER_MIN)
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_LIMIT
}
