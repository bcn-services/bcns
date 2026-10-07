// §4.5 Google Meet notes: Drive folder walk + export of each Gemini notes doc; parseNotes cleans the text.
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

export type MeetFormat = 'gemini-quick-notes' | 'gemini-legacy' | 'unknown'
export type ParsedNotes = {
  title: string
  participants: string[]
  body: string
  occurredAt: string | null
  format: MeetFormat
  hasTranscript: boolean
}

// Verbatim Gemini lines, matched by prefix on the trimmed line so small trailing variations still strip.
const BOILERPLATE = [
  'Please rate the new Quick notes tab',
  'Want to see more? View the full notes',
  'Tip: You can always access your full notes',
  "You should review Gemini's notes to make sure",
  'How is the quality of these specific notes?',
  'Meeting records Transcript',
  'This editable transcript was computer generated',
]
const isBoilerplate = (l: string) => BOILERPLATE.some(b => l.startsWith(b))
const BARE_DATE = /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/
const MEETING = /^Meeting ([A-Z][a-z]{2}) (\d{1,2}), (\d{4}) at (\d{1,2}):(\d{2}) (\S+)$/
const MEETING_ANY = /^Meeting [A-Z][a-z]{2} \d{1,2}, \d{4} at \d{1,2}:\d{2} \S+( - Transcript)?$/
const HEADING = /^(Summary|Details|Next steps|Action items|Notes|Transcript)$/i
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
// ponytail: US abbreviations + UTC/GMT/GMT±h only — non-US abbreviations (BST, CET, IST…) give null and
// normalize falls back to createdTime; upgrade to Intl/IANA lookup if a client's notes need it.
const TZ_HOURS: Record<string, number> = { EDT: -4, EST: -5, CDT: -5, CST: -6, MDT: -6, MST: -7, PDT: -7, PST: -8, UTC: 0, GMT: 0 }

function tzMinutes(tz: string): number | null {
  if (tz in TZ_HOURS) return TZ_HOURS[tz] * 60
  const m = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(tz)
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : null
}

function meetingTime(m: RegExpExecArray): string | null {
  const mon = MONTHS.indexOf(m[1])
  const off = tzMinutes(m[6])
  if (mon < 0 || off === null || Number(m[2]) > 31 || Number(m[4]) > 23 || Number(m[5]) > 59) return null
  return new Date(Date.UTC(Number(m[3]), mon, Number(m[2]), Number(m[4]), Number(m[5]) - off)).toISOString()
}

/** Splits a Gemini notes export into title / participants / occurredAt / cleaned body. Pure, line-based. */
export function parseNotes(name: string, text: string): ParsedNotes {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map(l => l.trim() === '' ? '' : l)
  const trimmed = lines.map(l => l.trim())
  const hasQuick = trimmed.some(l => /^✍️? Quick notes$/.test(l) || l === '📝 Full notes')
  const hasTranscript = hasQuick && trimmed.includes('📖 Transcript')
  const format: MeetFormat = hasQuick ? 'gemini-quick-notes'
    : /\s*[–-]\s*Notes by Gemini\s*$/i.test(name) || trimmed.some(l => l === 'Attendees' || l === 'Summary') ? 'gemini-legacy'
    : 'unknown'

  // An unknown (non-Gemini) doc keeps the pre-parser behaviour: name as title, no time, no participants.
  const mi = format === 'unknown' ? -1 : trimmed.findIndex(l => MEETING.test(l))
  const meeting = mi >= 0 ? MEETING.exec(trimmed[mi]) : null
  const topic = mi >= 0 ? trimmed.slice(mi + 1).find(l => l && !BARE_DATE.test(l) && !isBoilerplate(l)) : undefined
  const title = topic ?? name.replace(/\s*[–-]\s*Notes by Gemini\s*$/i, '').trim()

  const ai = format === 'unknown' ? -1 : trimmed.findIndex(l => /^(Attendees|Invited)$/i.test(l))
  let participants: string[] = []
  if (ai >= 0) {
    const rest = trimmed.slice(ai + 1)
    const block = rest.slice(Math.max(0, rest.findIndex(l => l !== '')))
    const end = block.findIndex(l => l === '' || HEADING.test(l))
    participants = block.slice(0, end < 0 ? undefined : end).join(',').split(',').map(s => s.trim()).filter(Boolean)
  }

  let body = text
  if (hasQuick) {
    const kept: string[] = []
    lines.forEach((l, i) => {
      const t = trimmed[i]
      if (isBoilerplate(t) || BARE_DATE.test(t) || MEETING_ANY.test(t) || /^✍️? Quick notes$/.test(t) || t === '📝 Full notes') return
      kept.push(t === '📖 Transcript' ? '---\nTranscript\n---' : l)
    })
    body = kept.join('\n').replace(/\n{4,}/g, '\n\n\n').trim()
  }
  return { title, participants, body, occurredAt: meeting ? meetingTime(meeting) : null, format, hasTranscript }
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
      const parsed = parseNotes(String(p.name ?? ''), String(p.text ?? ''))
      messages.push({
        externalId: String(p.id), kind: 'meeting_note', title: parsed.title, body: p.text == null ? null : parsed.body,
        occurred_at: parsed.occurredAt ?? new Date(p.createdTime ?? p.modifiedTime ?? Date.now()).toISOString(),
        participants: parsed.participants, url: p.webViewLink ?? null,
        attributes: {
          modified_time: p.modifiedTime ?? null, owners: p.owners ?? null,
          format: parsed.format, has_transcript: parsed.hasTranscript,
        },
        source_updated_at: p.modifiedTime ?? null,
      })
    }
    return { messages }
  },
}
