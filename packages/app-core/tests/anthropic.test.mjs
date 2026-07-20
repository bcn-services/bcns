/**
 * anthropic.test.mjs — Unit tests for the BYOK client factory.
 * Uses a mock ClientCtor via dependency injection — no network, no real SDK.
 * Run with: tsx tests/anthropic.test.mjs
 */

import assert from "node:assert/strict";
import {
  DEFAULT_MODEL,
  MissingApiKeyError,
  createAnthropicClient,
} from "../src/anthropic.ts";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

/** Records the options it was constructed with, standing in for Anthropic. */
class MockAnthropic {
  constructor(opts) {
    this.opts = opts;
  }
}

console.log("\ncreateAnthropicClient — happy path");

test("builds a client from a valid key via injected ctor", () => {
  const client = createAnthropicClient({ apiKey: "sk-test-123" }, { ClientCtor: MockAnthropic });
  assert.ok(client instanceof MockAnthropic);
  assert.equal(client.opts.apiKey, "sk-test-123");
});

test("defaults the model to DEFAULT_MODEL", () => {
  const client = createAnthropicClient({ apiKey: "sk-test-123" }, { ClientCtor: MockAnthropic });
  assert.equal(client.defaultModel, DEFAULT_MODEL);
  assert.equal(DEFAULT_MODEL, "claude-haiku-4-5");
});

test("honors an explicit model override", () => {
  const client = createAnthropicClient(
    { apiKey: "sk-test-123", model: "claude-opus-4-1" },
    { ClientCtor: MockAnthropic },
  );
  assert.equal(client.defaultModel, "claude-opus-4-1");
});

console.log("\ncreateAnthropicClient — key validation");

test("throws MissingApiKeyError on missing key", () => {
  assert.throws(
    () => createAnthropicClient({ apiKey: undefined }, { ClientCtor: MockAnthropic }),
    MissingApiKeyError,
  );
});

test("throws MissingApiKeyError on empty key", () => {
  assert.throws(
    () => createAnthropicClient({ apiKey: "" }, { ClientCtor: MockAnthropic }),
    MissingApiKeyError,
  );
});

test("throws MissingApiKeyError on whitespace-only key", () => {
  assert.throws(
    () => createAnthropicClient({ apiKey: "   " }, { ClientCtor: MockAnthropic }),
    MissingApiKeyError,
  );
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
