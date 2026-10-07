// Directory reviewers read tool titles and annotations; every listed tool needs a human title in
// both places and must advertise read-only, non-destructive behaviour.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mcpTools } from '../dist/mcp.js'

test('every listed tool has a human title, mirrored in annotations, and is read-only', () => {
  const tools = mcpTools()
  assert.ok(tools.length >= 2)
  for (const t of tools) {
    assert.equal(typeof t.title, 'string')
    assert.ok(t.title.trim().length > 0, `${t.name} has an empty title`)
    assert.notEqual(t.title, t.name, `${t.name} title is just the machine name`)
    assert.ok(!/_/.test(t.title), `${t.name} title reads like a machine name`)
    assert.equal(t.annotations.title, t.title)
    assert.equal(t.annotations.readOnlyHint, true)
    assert.equal(t.annotations.destructiveHint, false)
  }
})
