// mcp-limit.test.mjs — port of apps/mcp/tests/limit.test.mjs onto lib/mcp/limit.ts.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LIMIT,
  MAX_KEYS,
  WINDOW_MS,
  createRateLimiter,
  limitFromEnv,
} from "../lib/mcp/limit.ts";

test("the call past the limit is rejected", () => {
  const limiter = createRateLimiter(3);
  assert.deepEqual(
    [0, 1, 2, 3].map(() => limiter.allow("tok", 1_000_000)),
    [true, true, true, false]
  );
});

test("the window rolls over", () => {
  const limiter = createRateLimiter(2, 1000);
  const t0 = 500_000;
  assert.equal(limiter.allow("tok", t0), true);
  assert.equal(limiter.allow("tok", t0 + 1), true);
  assert.equal(limiter.allow("tok", t0 + 2), false);
  assert.equal(limiter.allow("tok", t0 + 1000), true, "a fresh window starts");
});

test("one caller cannot spend another caller's budget", () => {
  const limiter = createRateLimiter(1);
  assert.equal(limiter.allow("token-a", 2000), true);
  assert.equal(limiter.allow("token-a", 2000), false);
  assert.equal(limiter.allow("token-b", 2000), true);
});

test("defaults are 60 a minute; the env override only takes a positive integer", () => {
  assert.equal(DEFAULT_LIMIT, 60);
  assert.equal(WINDOW_MS, 60_000);
  assert.equal(limitFromEnv({}), 60);
  assert.equal(limitFromEnv({ MCP_RATE_LIMIT_PER_MIN: "10" }), 10);
  for (const bad of ["lots", "0", "-5"])
    assert.equal(limitFromEnv({ MCP_RATE_LIMIT_PER_MIN: bad }), 60);
});

test("the window map is bounded: a flood of fresh keys evicts instead of growing", () => {
  const limiter = createRateLimiter(1, 60_000);
  const now = 9_000_000;
  assert.equal(limiter.allow("victim", now), true);
  assert.equal(limiter.allow("victim", now), false);
  for (let i = 0; i < MAX_KEYS; i += 1) limiter.allow(`flood-${i}`, now);
  // ponytail: eviction is fail-open by design (documented ceiling), so the victim gets a fresh budget.
  assert.equal(limiter.allow("victim", now), true);
});
