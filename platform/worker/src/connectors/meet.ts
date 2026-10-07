// §4.5 Google Meet notes — PROVISIONAL. Drive listing + OAuth refresh are documented API
// behaviour; the note format (title suffix, participant block) is unverified until a sample lands.
import { z } from 'zod'
import {
  type CanonicalWrites, type Connector, type MessageRow, type Page, type RawRow, type RunContext,
} from './index.js'
import { DRIVE, FOLDER, googleFetch, refreshGoogleToken, walkFolder } from './google.js'

const FIELDS = 'nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,webViewLink,owners)'

const configSchema = z.object({
  folder_id: z.string(),
  oauth_client_id: z.string().optional(),
  notes_url: z.string().optional(),
}).passthrough()

/** Walks the folder tree; `since` filters docs at every level, subfolders are always listed. */
async function* pull(ctx: RunContext, since: Date | null): AsyncGenerator<Page> {
  let latest = since ? since.getTime() : 0
  const doc = `mimeType='application/vnd.google-apps.document'`
  const match = `(mimeType='${FOLDER}' or ${since ? `(${doc} and modifiedTime > '${since.toISOString()}')` : doc})`
  for await (const { files, last } of walkFolder(ctx, 'meet', String(ctx.config.folder_id), { match, fields: FIELDS })) {
    const raw: RawRow[] = []
    for (const f of files) {
      raw.push({ entity: 'drive_file', externalId: String(f.id), sourceUpdatedAt: new Date(f.modifiedTime), payload: f })
      const text = await (await googleFetch(ctx, 'meet', `${DRIVE}/files/${f.id}/export?mimeType=text%2Fplain`)).text()
      raw.push({ entity: 'doc', externalId: String(f.id), sourceUpdatedAt: new Date(f.modifiedTime), payload: { ...f, text } })
      latest = Math.max(latest, new Date(f.modifiedTime).getTime())
    }
    yield {
      raw, entity: 'drive_file',
      cursor: last ? { modified_time: new Date(latest || Date.now()).toISOString() } : {},
      entityDone: last, done: last,
    }
  }
}

/**
 * PROVISIONAL (§4.5, Needs Nate N3): the trailing "Notes by Gemini" suffix and the attendee
 * header block are unverified. Participants stay empty until a real sample exists.
 */
export function parseNotes(name: string, text: string): { title: string; participants: string[] } {
  void text
  return { title: name.replace(/\s*[–-]\s*Notes by Gemini\s*$/i, '').trim(), participants: [] }
}

export const meet: Connector = {
  source: 'meet',
  defaults: {
    interval: '1 hour',
    backfillDepth: 'unbounded',
    rateLimit: { concurrency: 2, minDelayMs: 200 },
  },
  configSchema,
  tokenKind: 'google_oauth_refresh',

  backfill(ctx) { return pull(ctx, null) },
  incremental(ctx, cursors) {
    const c = cursors?.drive_file?.modified_time
    return pull(ctx, c ? new Date(c) : null)
  },

  refreshToken(ctx) { return refreshGoogleToken(ctx, 'meet') },

  normalize(_ctx: RunContext, rows: RawRow[]): CanonicalWrites {
    const messages: MessageRow[] = []
    for (const r of rows) {
      if (r.entity !== 'doc') continue
      const p = r.payload
      const { title, participants } = parseNotes(String(p.name ?? ''), String(p.text ?? ''))
      messages.push({
        externalId: String(p.id), kind: 'meeting_note', title, body: p.text ?? null,
        occurred_at: new Date(p.createdTime ?? p.modifiedTime ?? Date.now()).toISOString(),
        participants, url: p.webViewLink ?? null,
        attributes: { modified_time: p.modifiedTime ?? null, owners: p.owners ?? null },
        source_updated_at: p.modifiedTime ?? null,
      })
    }
    return { messages }
  },
}
