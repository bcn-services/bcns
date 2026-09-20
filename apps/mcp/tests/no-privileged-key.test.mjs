// The property this whole server rests on: it never holds a credential stronger than the
// caller's own token. The needle is assembled at runtime so this file does not itself match
// the grep that checks the same thing.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url))
const SKIP = new Set(['node_modules', 'dist', '.turbo', '.next'])
const NEEDLE = ['SERVICE', 'ROLE'].join('_').toLowerCase()

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* sourceFiles(full)
    else yield full
  }
}

test('no file under apps/mcp mentions the privileged key', () => {
  const offenders = []
  for (const file of sourceFiles(APP_ROOT)) {
    if (readFileSync(file, 'utf8').toLowerCase().includes(NEEDLE)) offenders.push(file)
  }
  assert.deepEqual(offenders, [])
})
