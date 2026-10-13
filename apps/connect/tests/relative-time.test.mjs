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

test("bucket edges", () => {
  const DAY = 86_400_000;
  assert.equal(relativeTime(ago(59_999), now), "just now");
  assert.equal(relativeTime(ago(60_000), now), "1m ago");
  assert.equal(relativeTime(ago(3_599_999), now), "59m ago");
  assert.equal(relativeTime(ago(3_600_000), now), "1h ago");
  assert.equal(relativeTime(ago(DAY), now), "1d ago");
  assert.equal(relativeTime(ago(30 * DAY - 1), now), "29d ago");
  assert.equal(relativeTime(ago(30 * DAY), now), "2026-09-11");
});

test("far-future timestamp is a date, not just now", () => {
  assert.equal(relativeTime(new Date(now + 400 * 86_400_000).toISOString(), now), "2027-11-15");
});

test("older than 30 days is a date in the client timezone", () => {
  assert.equal(relativeTime("2026-08-01T02:00:00Z", now, "America/New_York"), "2026-07-31");
  assert.equal(relativeTime("2026-08-01T02:00:00Z", now), "2026-08-01");
});

test("missing or bad input is never", () => {
  assert.equal(relativeTime(null, now), "never");
  assert.equal(relativeTime("nope", now), "never");
});
