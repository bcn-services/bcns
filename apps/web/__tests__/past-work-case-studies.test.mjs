// Past Work case-study fields: PastWorkItem carries slug/problem/approach/outcome/screenshots.
// DeLuca's and L2 Detailz are real businesses. The narrative fields are filled from
// detail Nate confirmed directly; the guard below now checks they stay filled and
// within their CONTENT.md caps, rather than requiring placeholders as it once did.
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

const INPUT_RE = /\[(INPUT|SLOT):/;

// Caps mirror CONTENT.md. These fields are now filled with detail Nate confirmed
// about both businesses, so the guard is inverted: it used to require an
// [INPUT: ...] placeholder (blocking any agent from inventing prose about a real
// client), and now requires the opposite — real copy, no placeholder regression,
// and no drift past the documented length. The anti-fabrication rule itself still
// lives in CONTENT.md and still binds: never write these from inference.
const FIELD_CAPS = { title: 60, problem: 150, approach: 150, outcome: 120 };

for (const [field, cap] of Object.entries(FIELD_CAPS)) {
  test(`every item's ${field} is filled real copy within ${cap} chars`, () => {
    for (const item of items) {
      const value = item[field];
      assert.equal(typeof value, "string", `item "${item.slug}".${field} is not a string`);
      assert.ok(value.trim().length > 0, `item "${item.slug}".${field} is empty`);
      assert.doesNotMatch(
        value,
        INPUT_RE,
        `item "${item.slug}".${field} regressed to a placeholder: "${value}"`,
      );
      assert.ok(
        value.length <= cap,
        `item "${item.slug}".${field} is ${value.length} chars, over the ${cap} cap`,
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
