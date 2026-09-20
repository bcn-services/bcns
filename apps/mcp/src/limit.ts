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

/** Hard ceiling on tracked windows. The limit is checked before the token is verified — it has
 *  to be, or verification itself is the unmetered call — so any sender can mint fresh keys. */
export const MAX_KEYS = 10_000

// ponytail: in-memory, single process. A second process serving /mcp doubles the effective
// limit and a restart forgets every counter. Move the window to Postgres or Redis the day
// there is more than one process. Eviction trades fairness for bounded memory: a flood of
// unique tokens can push a legitimate caller's counter out and hand it a fresh budget.
export function createRateLimiter(limit = DEFAULT_LIMIT, windowMs = WINDOW_MS): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>()

  return {
    allow(token, now = Date.now()) {
      const k = key(token)
      const seen = windows.get(k)
      if (!seen || now - seen.start >= windowMs) {
        // delete-then-set so Map insertion order tracks window start: the oldest entry is
        // always the stalest window, which makes the eviction below O(1) and not merely FIFO.
        if (seen) windows.delete(k)
        while (windows.size >= MAX_KEYS) {
          const oldest = windows.keys().next()
          if (oldest.done) break
          windows.delete(oldest.value)
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
