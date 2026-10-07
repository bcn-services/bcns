// §4.5 parseNotes + meet normalize. No DB: pure parsing over a synthetic Gemini export (CRLF) and the legacy sample.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { connectors, type RawRow, type RunContext } from '../worker/src/connectors/index.js'
import { parseNotes } from '../worker/src/connectors/meet.js'

const quick = readFileSync(new URL('./fixtures/meet-gemini-quick-notes.txt', import.meta.url), 'utf8')
const sample = JSON.parse(readFileSync(new URL('./fixtures/meet-sample.json', import.meta.url), 'utf8'))
const NAME = 'Meeting started 2026/09/22 16:41 EDT - Notes by Gemini'
const BOILERPLATE = [
  'Please rate the new Quick notes tab', 'Want to see more?', 'Tip: You can always access', "You should review Gemini's notes",
  'How is the quality of these specific notes?', 'Meeting records Transcript', 'This editable transcript was computer generated',
]
const docRow = (p: Record<string, unknown>): RawRow => ({ entity: 'doc', externalId: String(p.id), sourceUpdatedAt: new Date(), payload: p })
const normalize = (rows: RawRow[]) => connectors.meet.normalize({} as RunContext, rows).messages!

describe('meet parseNotes', () => {
  it('gemini quick-notes: topic title, cleaned summary-first body, transcript divider, meeting-line time', () => {
    expect(quick).toContain('\r\n')
    const r = parseNotes(NAME, quick)
    expect(r.title).toBe('Quarterly planning review and vendor onboarding')
    expect(r.format).toBe('gemini-quick-notes')
    expect(r.hasTranscript).toBe(true)
    expect(r.participants).toEqual([])
    expect(r.occurredAt).toBe('2026-09-22T20:41:00.000Z')
    expect(r.body).not.toContain('\r')
    for (const b of BOILERPLATE) expect(r.body, b).not.toContain(b)
    expect(r.body).not.toMatch(/^(✍️ Quick notes|📝 Full notes|Sep 22, 2026|Meeting Sep 22.*)$/m)
    expect(r.body).not.toMatch(/\n{4,}/)
    const divider = r.body.indexOf('---\nTranscript\n---')
    expect(divider).toBeGreaterThan(0)
    expect(r.body.indexOf('Planning priorities')).toBeLessThan(divider)
    expect(r.body.indexOf('Person 1: Let')).toBeGreaterThan(divider)
    expect(r.body.slice(0, 200)).toContain('Planning priorities')
  })

  it('legacy gemini doc: suffix-stripped title, Attendees participants, body untouched', () => {
    const text = sample.exports.doc1
    const r = parseNotes(sample.files.files[0].name, text)
    expect(r).toMatchObject({ title: 'Weekly Sync', participants: ['Person 1', 'Person 2'], format: 'gemini-legacy', body: text, occurredAt: null, hasTranscript: false })
  })

  it('markerless doc falls back to today: name as title, body untouched', () => {
    const text = 'Just some notes\r\nwith no markers\r\n'
    expect(parseNotes('Team lunch ideas', text)).toEqual({
      title: 'Team lunch ideas', participants: [], body: text, occurredAt: null, format: 'unknown', hasTranscript: false,
    })
  })

  it('markerless doc ignores a stray meeting line and Invited heading', () => {
    const text = 'Meeting Sep 22, 2026 at 16:41 EDT\nNot a topic\nInvited\nfoo\nbar\n'
    expect(parseNotes('Plain doc', text)).toEqual({
      title: 'Plain doc', participants: [], body: text, occurredAt: null, format: 'unknown', hasTranscript: false,
    })
  })

  it('attendees block stops at the next heading and skips a leading blank', () => {
    const name = 'Sync - Notes by Gemini'
    expect(parseNotes(name, 'Attendees\nPerson 1, Person 2\nSummary\nstuff\n').participants).toEqual(['Person 1', 'Person 2'])
    expect(parseNotes(name, 'Attendees\n\nPerson 3\n\nSummary\n').participants).toEqual(['Person 3'])
  })

  it('quick-notes body keeps content lines that only look like meeting lines; bad times give null', () => {
    const text = '✍️ Quick notes\nMeeting Sep 31, 2026 at 25:99 EDT\nTopic\nMeeting Oct 5, 2026 at 10:00 with the vendor\n'
    const r = parseNotes('x - Notes by Gemini', text)
    expect(r.body).toContain('Meeting Oct 5, 2026 at 10:00 with the vendor')
    expect(r.occurredAt).toBeNull()
  })

  it('timezones: offsets applied, GMT+h:mm parsed, unknown abbreviation gives null', () => {
    const at = (tz: string) => parseNotes('x', `📝 Full notes\nMeeting Jan 5, 2027 at 09:30 ${tz}\nTopic`).occurredAt
    expect(at('EST')).toBe('2027-01-05T14:30:00.000Z')
    expect(at('PST')).toBe('2027-01-05T17:30:00.000Z')
    expect(at('UTC')).toBe('2027-01-05T09:30:00.000Z')
    expect(at('GMT+5:30')).toBe('2027-01-05T04:00:00.000Z')
    expect(at('GMT-8')).toBe('2027-01-05T17:30:00.000Z')
    expect(at('CEST')).toBeNull()
  })
})

describe('meet normalize', () => {
  it('uses the meeting-line time and records format + has_transcript', () => {
    const [m] = normalize([docRow({ id: 'q1', name: NAME, text: quick, createdTime: '2026-09-22T21:00:00.000Z', modifiedTime: '2026-09-22T21:30:00.000Z' })])
    expect(m.title).toBe('Quarterly planning review and vendor onboarding')
    expect(m.occurred_at).toBe('2026-09-22T20:41:00.000Z')
    expect(m.attributes).toMatchObject({ format: 'gemini-quick-notes', has_transcript: true })
    expect(m.body).toContain('---\nTranscript\n---')
  })

  it('falls back to createdTime for legacy docs and unknown timezones', () => {
    const f = sample.files.files[0]
    const [legacy, tz] = normalize([
      docRow({ ...f, text: sample.exports.doc1 }),
      docRow({ id: 'q2', name: NAME, text: '📝 Full notes\nMeeting Sep 22, 2026 at 16:41 CEST\nTopic', createdTime: '2026-09-22T21:00:00.000Z' }),
    ])
    expect(legacy.occurred_at).toBe(f.createdTime)
    expect(legacy.participants).toEqual(['Person 1', 'Person 2'])
    expect(legacy.body).toBe(sample.exports.doc1)
    expect(legacy.attributes).toMatchObject({ format: 'gemini-legacy', has_transcript: false })
    expect(tz.occurred_at).toBe('2026-09-22T21:00:00.000Z')
  })
})
