// set-branding.ts input checks: all of them fail before any database or Storage call. No DB.
import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isPng, main } from '../scripts/set-branding.js'
import { ScriptError } from '../scripts/_lib.js'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const ID = 'a0000000-0000-4000-8000-000000000001'
const dir = mkdtempSync(join(tmpdir(), 'branding-'))
const put = (name: string, bytes: Buffer) => { const p = join(dir, name); writeFileSync(p, bytes); return p }

describe('set-branding', () => {
  it('isPng checks the 8 magic bytes, not the name', () => {
    expect(isPng(PNG)).toBe(true)
    expect(isPng(Buffer.from('/9j/4AAQSkZJRgABAQ', 'base64'))).toBe(false) // JPEG
    expect(isPng(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe(false)
    expect(isPng(PNG.subarray(0, 8))).toBe(false) // header only
    expect(isPng(Buffer.alloc(0))).toBe(false)
  })

  it('rejects a non-PNG logo or favicon (even named .png), bad ids, bad accent', async () => {
    const fake = put('logo.png', Buffer.from('GIF89a not a png at all'))
    const real = put('real.png', PNG)
    await expect(main([ID, '--logo', fake])).rejects.toThrow(/--logo: .* is not a PNG/)
    await expect(main([ID, '--logo', real, '--favicon', fake])).rejects.toThrow(/--favicon: .* is not a PNG/)
    await expect(main([ID, '--logo', join(dir, 'missing.png')])).rejects.toThrow('cannot read')
    await expect(main(['acme', '--logo', real])).rejects.toThrow('not a client id')
    await expect(main([ID, '--logo', real, '--accent', 'red'])).rejects.toThrow('--accent')
    await expect(main([ID])).rejects.toBeInstanceOf(ScriptError)
  })
})
