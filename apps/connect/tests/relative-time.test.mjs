import { test } from "node:test";
import assert from "node:assert/strict";
import { relativeTime } from "../app/relative-time.ts";

const now = Date.parse("2026-10-11T12:00:00Z");
const ago = (ms) => new Date(now - ms).toISOString();

test("relative buckets", () => {
  assert.equal(relativeTime(ago(30_000), now), "just now");
  assert.equal(relativeTime(ago(12 * 60_000), now), "12m ago");
  assert.equal(relativeTime(ago(7 * 3_600_000), now), "7h ago");
  assert.equal(relativeTime(ago(2 * 86_400_000), now), "2d ago");
  assert.equal(relativeTime(new Date(now + 5000).toISOString(), now), "just now");
});

test("older than 30 days is a date in the client timezone", () => {
  assert.equal(relativeTime("2026-08-01T02:00:00Z", now, "America/New_York"), "2026-07-31");
  assert.equal(relativeTime("2026-08-01T02:00:00Z", now), "2026-08-01");
});

test("missing or bad input is never", () => {
  assert.equal(relativeTime(null, now), "never");
  assert.equal(relativeTime("nope", now), "never");
});
