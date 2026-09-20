// node:http entry. systemd runs `node server.js` in /srv/mcp/current with PORT and HOSTNAME
// from /srv/mcp/env; the committed top-level server.js imports this file's build output.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { isIP } from 'node:net'
import { authorize, clientForToken, supabaseEnv, verifyToken, type SupabaseEnv } from './auth.js'
import { createRateLimiter, limitFromEnv } from './limit.js'
import { handleMcpPost } from './mcp.js'

const PORT = Number(process.env.PORT ?? 3103)

/** nginx's own default, so the cap matches the proxy rather than inventing a second one. */
const MAX_BODY_BYTES = 1024 * 1024

// HOSTNAME is the env name the unit file sets, but it is also a name the shell exports on some
// systems. Only a literal address binds: a stray `HOSTNAME=some-host` resolves to whatever that
// name points at, which is how a loopback service quietly ends up on a public interface.
const HOSTNAME = isIP(process.env.HOSTNAME ?? '') ? (process.env.HOSTNAME as string) : '127.0.0.1'

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}

export function createMcpHttpServer(env: SupabaseEnv, limit = limitFromEnv()) {
  const limiter = createRateLimiter(limit)
  const deps = {
    verify: (token: string) => verifyToken(token, env),
    allow: (token: string) => limiter.allow(token),
  }

  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url ?? '').split('?')[0]

    // deploy-app.yml's health check curls exactly this path. Unauthenticated by design.
    if (req.method === 'GET' && path === '/api/health') return json(res, 200, { ok: true })

    if (req.method !== 'POST' || path !== '/mcp') return json(res, 404, { error: 'not_found' })

    // Matches nginx client_max_body_size; also caps a direct-to-port caller the proxy never saw.
    if (Number(req.headers['content-length'] ?? 0) > MAX_BODY_BYTES) {
      return json(res, 413, { error: 'payload_too_large' })
    }

    const auth = await authorize(req.headers, deps)
    if (!auth.ok) return json(res, auth.status, auth.body, auth.headers)

    try {
      await handleMcpPost(req, res, clientForToken(auth.token, env))
    } catch {
      // The transport owns the response once it starts writing; only a pre-write failure lands here.
      if (!res.headersSent) json(res, 500, { error: 'internal_error' })
      else res.end()
    }
  })
}

createMcpHttpServer(supabaseEnv()).listen(PORT, HOSTNAME, () => {
  console.log(`mcp listening on http://${HOSTNAME}:${PORT}`)
})
