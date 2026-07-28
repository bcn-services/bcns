// Past Work case-study fields: PastWorkItem carries slug/problem/approach/outcome/screenshots.
// Anti-fabrication guard — DeLuca's and L2 Detailz are real businesses, so every narrative
// field must still be an [INPUT: ...] placeholder, never drafted prose.
// Run: node --experimental-strip-types --test __tests__/past-work-case-studies.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { siteContent } from "../lib/content.ts";

const { items } = siteContent.pastWork;

test("pastWork.items has exactly 2 entries", () => {
  assert.equal(items.length, 2);
});

test("slugs are exactly delucas and l2detailz", () => {
  const slugs = items.map((i) => i.slug);
  assert.deepEqual(slugs.sort(), ["delucas", "l2detailz"]);
});

test("every slug is unique", () => {
  const slugs = items.map((i) => i.slug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test("every slug matches ^[a-z0-9-]+$", () => {
  for (const item of items) {
    assert.match(item.slug, /^[a-z0-9-]+$/, `slug "${item.slug}" has invalid characters`);
  }
});

const INPUT_RE = /^\[INPUT: .+\]$/;

for (const field of ["title", "problem", "approach", "outcome"]) {
  test(`every item's ${field} is an [INPUT: ...] placeholder (anti-fabrication guard)`, () => {
    for (const item of items) {
      assert.match(
        item[field],
        INPUT_RE,
        `item "${item.slug}".${field} = "${item[field]}" is not an [INPUT: ...] placeholder`,
      );
    }
  });
}

test("every item's screenshots is an array", () => {
  for (const item of items) {
    assert.ok(Array.isArray(item.screenshots), `item "${item.slug}".screenshots is not an array`);
  }
});

test("any populated screenshot entry has the { src, alt, caption } shape", () => {
  for (const item of items) {
    for (const shot of item.screenshots) {
      assert.equal(typeof shot.src, "string");
      assert.equal(typeof shot.alt, "string");
      assert.equal(typeof shot.caption, "string");
    }
  }
});
