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
