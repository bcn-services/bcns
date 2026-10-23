// §4.5/§4.6 shared Google plumbing for meet + drive: bearer fetch, OAuth refresh, recursive folder walk.
import { type Json, type RunContext, type Source, SourceError } from './index.js'
import { envStr } from '../db.js'

export const DRIVE = 'https://www.googleapis.com/drive/v3'
export const FOLDER = 'application/vnd.google-apps.folder'
const SHORTCUT = 'application/vnd.google-apps.shortcut'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
// ponytail: fixed ceilings (root = depth 0, root counts as a folder); make them per-client config if a real tree trips one.
const MAX_DEPTH = 8
const MAX_FOLDERS = 500

export async function googleFetch(ctx: RunContext, source: Source, url: string): Promise<Response> {
  const r = await ctx.fetch(url, { headers: { Authorization: `Bearer ${ctx.token.secret}` } })
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    throw new SourceError(source, String(body?.error?.message ?? `HTTP ${r.status}`), r.status, body)
  }
  return r
}

/**
 * Operator rows (attributes.oauth_client_secret set, e.g. SB) send exactly what they always did.
 * Hub-connected rows carry only config.oauth_client_id: the bcns-owned client's secret comes from env
 * GOOGLE_CLIENT_SECRET, and only when the row's client id is the env GOOGLE_CLIENT_ID, so bcns's secret
 * never goes out with another client's id. The message names config keys, never a value.
 */
export function googleClientCreds(ctx: RunContext, source: Source): { client_id: string; client_secret: string } {
  const own = ctx.token.attributes?.oauth_client_secret
  if (typeof own === 'string' && own !== '') return { client_id: ctx.config.oauth_client_id ?? '', client_secret: own }
  const envId = envStr('GOOGLE_CLIENT_ID'), envSecret = envStr('GOOGLE_CLIENT_SECRET')
  const id = ctx.config.oauth_client_id || envId
  if (!id || id !== envId || !envSecret) {
    throw new SourceError(source, 'no Google OAuth client secret: row has no attributes.oauth_client_secret and GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET do not match this row')
  }
  return { client_id: id, client_secret: envSecret }
}

export async function refreshGoogleToken(ctx: RunContext, source: Source): Promise<{ secret: string; expiresAt: Date }> {
  const { client_id, client_secret } = googleClientCreds(ctx, source)
  const r = await ctx.fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: ctx.token.refresh_secret ?? '',
      client_id,
      client_secret,
    }).toString(),
  })
  const b: Json = await r.json().catch(() => ({}))
  if (!r.ok || b.error) throw new SourceError(source, String(b.error_description ?? b.error ?? `HTTP ${r.status}`), r.status, b)
  return { secret: String(b.access_token), expiresAt: new Date(Date.now() + Number(b.expires_in ?? 3600) * 1000) }
}

/**
 * BFS over rootId and its subfolders: one files.list per folder page (`'<id>' in parents and trashed=false`
 * plus `match`), children split here — folders queued, shortcuts skipped (not followed), the rest yielded once
 * even if multi-parented. Yields every page, empty ones too; `last` = final page of the whole tree.
 * `folderPath` = the names of the folders from the root down to this page's folder, joined by '/' ('' = the root).
 * A cap trip throws (no status → run `error`) before any `last` page, so a fullList source never tombstones.
 * ponytail: a budget-stopped walk restarts from root next run; move the queue into the cursor if a tree outgrows the budget.
 */
export async function* walkFolder(
  ctx: RunContext, source: Source, rootId: string, opts: { match?: string; fields: string },
): AsyncGenerator<{ files: Json[]; last: boolean; folderPath: string }> {
  const queue = [{ id: rootId, depth: 0, path: '' }]
  const folders = new Set([rootId])
  const seen = new Set<string>()
  let shortcuts = 0
  const cap = (why: string): never => {
    ctx.log('google_walk_cap', { root: rootId, why, folders: folders.size })
    throw new SourceError(source, `folder walk stopped: ${why}`)
  }
  while (queue.length) {
    const { id, depth, path } = queue.shift()!
    let pageToken: string | undefined
    do {
      const u = new URL(`${DRIVE}/files`)
      u.searchParams.set('q', `'${id}' in parents and trashed=false` + (opts.match ? ` and ${opts.match}` : ''))
      u.searchParams.set('fields', opts.fields)
      u.searchParams.set('pageSize', '100')
      if (pageToken) u.searchParams.set('pageToken', pageToken)
      const b: Json = await (await googleFetch(ctx, source, u.toString())).json()
      pageToken = b.nextPageToken ?? undefined

      const files: Json[] = []
      for (const f of b.files ?? []) {
        const fid = String(f.id)
        if (f.mimeType === FOLDER) {
          if (folders.has(fid)) continue
          if (depth + 1 > MAX_DEPTH) cap(`deeper than ${MAX_DEPTH} levels`)
          if (folders.size >= MAX_FOLDERS) cap(`more than ${MAX_FOLDERS} folders under ${rootId}`)
          folders.add(fid)
          queue.push({ id: fid, depth: depth + 1, path: path ? `${path}/${f.name ?? fid}` : String(f.name ?? fid) })
        } else if (f.mimeType === SHORTCUT) shortcuts++
        else if (!seen.has(fid)) { seen.add(fid); files.push(f) }
      }
      const last = !pageToken && !queue.length
      if (last && shortcuts) ctx.log('google_walk_shortcut_skip', { count: shortcuts })
      yield { files, last, folderPath: path }
    } while (pageToken)
  }
}
