import test from 'node:test'
import assert from 'node:assert/strict'
import { DataClientError, ToolInputError, agentTools } from '@bcn-services/data-client'
import { mcpTools, toolError } from '../dist/mcp.js'

test('every agentTools() entry survives the projection', () => {
  const source = agentTools()
  const mapped = mcpTools()

  assert.ok(source.length > 0)
  assert.equal(mapped.length, source.length)
  assert.deepEqual(mapped.map((t) => t.name), source.map((t) => t.name))

  for (const tool of mapped) {
    assert.equal(typeof tool.name, 'string')
    assert.ok(tool.name.length > 0)
    assert.equal(typeof tool.description, 'string')
    assert.ok(tool.description.length > 0)
    assert.equal(typeof tool.inputSchema, 'object')
    assert.equal(tool.inputSchema.type, 'object')
    assert.equal(typeof tool.inputSchema.properties, 'object')
  }
})

test('the schema is passed through, not rebuilt', () => {
  const [source] = agentTools()
  const [mapped] = mcpTools()
  assert.deepEqual(mapped.inputSchema, source.input_schema)
})

test('ToolInputError becomes an isError result carrying its message', () => {
  const result = toolError(new ToolInputError('bad column name: drop'))
  assert.equal(result.isError, true)
  assert.equal(result.content[0].text, 'bad column name: drop')
})

test('DataClientError becomes an isError result carrying its message', () => {
  const pgError = { message: 'no tenant for this caller', code: 'BCNS0', details: 'd', hint: 'h' }
  const result = toolError(new DataClientError(pgError))
  assert.equal(result.isError, true)
  assert.equal(result.content[0].text, 'no tenant for this caller')
})

test('neither mapped error leaks a stack', () => {
  for (const err of [new ToolInputError('boom'), new DataClientError({ message: 'boom', code: 'BCNS3', details: 'd', hint: 'h' })]) {
    const text = toolError(err).content[0].text
    assert.equal(text, 'boom')
    assert.ok(!text.includes('\n    at '))
    assert.ok(!text.includes(import.meta.url))
  }
})

test('anything else is generic — no message, no stack, no internals', () => {
  const leaky = new Error('connect ECONNREFUSED 10.0.0.7:5432 as postgres')
  const result = toolError(leaky)
  assert.equal(result.isError, true)
  assert.equal(result.content[0].text, 'tool call failed')
  assert.ok(!result.content[0].text.includes('10.0.0.7'))
  assert.equal(toolError('a bare string').content[0].text, 'tool call failed')
})

test('an unmapped sqlstate is generic — the raw Postgres text is not an enumeration oracle', () => {
  // code === 'unknown' means the message is whatever PostgREST said, not the data-client's own
  // vocabulary. `42703` names a column the caller guessed; `PGRST202` names a function that
  // exists or does not. Both answer a question the caller is not entitled to ask.
  const cases = [
    { message: 'column clients.secret_notes does not exist', code: '42703' },
    { message: 'Could not find the function api.internal_sweep in the schema cache', code: 'PGRST202' },
    { message: 'TypeError: fetch failed', code: '' },
  ]
  for (const { message, code } of cases) {
    const err = new DataClientError({ message, code, details: 'd', hint: 'h' })
    assert.equal(err.code, 'unknown', `${code} should not be a mapped code`)
    assert.equal(toolError(err).content[0].text, 'tool call failed')
  }
})

test('every mapped sqlstate still carries its message', () => {
  for (const code of ['BCNS0', 'BCNS1', 'BCNS2', 'BCNS3', 'BCNS4', 'BCNS5']) {
    const err = new DataClientError({ message: `msg-${code}`, code, details: 'd', hint: 'h' })
    assert.notEqual(err.code, 'unknown')
    assert.equal(toolError(err).content[0].text, `msg-${code}`)
  }
})
