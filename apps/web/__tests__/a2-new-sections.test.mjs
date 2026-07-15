/**
 * A2 QA gate: Scaffold the missing sections.
 * Verifies all 5 new section keys in the content registry and nav.
 * Run with: npx tsx apps/web/__tests__/a2-new-sections.test.mjs
 */

import { siteContent } from "../lib/content.ts";
import { siteConfig } from "../lib/site.ts";

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  FAIL: ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// [1] All 5 new section keys exist in siteContent
// ---------------------------------------------------------------------------
console.log("\n[1] siteContent has all 5 new section keys");
const NEW_KEYS = ["pastWork", "reviews", "pricing", "faq", "aboutFounder"];
for (const key of NEW_KEYS) {
  assert(`siteContent.${key} exists`, key in siteContent);
}

// ---------------------------------------------------------------------------
// [2] Collection arrays (not tuples) — type is Array, not fixed-length tuple
// ---------------------------------------------------------------------------
console.log("\n[2] Collection sections use extensible arrays (not fixed tuples)");
assert(
  "pastWork.items is an Array",
  Array.isArray(siteContent.pastWork.items),
);
assert(
  "reviews.items is an Array",
  Array.isArray(siteContent.reviews.items),
);
assert(
  "pricing.tiers is an Array",
  Array.isArray(siteContent.pricing.tiers),
);
assert(
  "faq.items is an Array",
  Array.isArray(siteContent.faq.items),
);

// ---------------------------------------------------------------------------
// [3] Collection arrays are non-empty (seeded with example entries)
// ---------------------------------------------------------------------------
console.log("\n[3] Collection arrays are seeded (non-empty)");
assert(
  "pastWork.items has >= 1 entry",
  siteContent.pastWork.items.length >= 1,
  `got ${siteContent.pastWork.items.length}`,
);
assert(
  "reviews.items has >= 1 entry",
  siteContent.reviews.items.length >= 1,
  `got ${siteContent.reviews.items.length}`,
);
assert(
  "pricing.tiers has >= 1 entry",
  siteContent.pricing.tiers.length >= 1,
  `got ${siteContent.pricing.tiers.length}`,
);
assert(
  "faq.items has >= 1 entry",
  siteContent.faq.items.length >= 1,
  `got ${siteContent.faq.items.length}`,
);

// ---------------------------------------------------------------------------
// [4] PastWork and Reviews items use [SLOT: ...] placeholders (no invented copy)
// ---------------------------------------------------------------------------
console.log("\n[4] PastWork and Reviews items carry [SLOT: ...] placeholders");
const SLOT_RE = /\[SLOT:/;

for (let i = 0; i < siteContent.pastWork.items.length; i++) {
  const { title, outcome } = siteContent.pastWork.items[i];
  assert(
    `pastWork.items[${i}].title is a SLOT placeholder`,
    SLOT_RE.test(title),
    `got "${title}"`,
  );
  assert(
    `pastWork.items[${i}].outcome is a SLOT placeholder`,
    SLOT_RE.test(outcome),
    `got "${outcome}"`,
  );
}

for (let i = 0; i < siteContent.reviews.items.length; i++) {
  const { quote, author } = siteContent.reviews.items[i];
  assert(
    `reviews.items[${i}].quote is a SLOT placeholder`,
    SLOT_RE.test(quote),
    `got "${quote}"`,
  );
  assert(
    `reviews.items[${i}].author is a SLOT placeholder`,
    SLOT_RE.test(author),
    `got "${author}"`,
  );
}

// ---------------------------------------------------------------------------
// [5] aboutFounder has required fields
// ---------------------------------------------------------------------------
console.log("\n[5] aboutFounder has required fields");
assert("aboutFounder.eyebrow present", "eyebrow" in siteContent.aboutFounder);
assert("aboutFounder.title present", "title" in siteContent.aboutFounder);
assert("aboutFounder.bio present", "bio" in siteContent.aboutFounder);
assert(
  "aboutFounder.credentials is an Array",
  Array.isArray(siteContent.aboutFounder.credentials),
);

// ---------------------------------------------------------------------------
// [6] site.ts nav has all 5 new entries with correct anchors
// ---------------------------------------------------------------------------
console.log("\n[6] siteConfig.nav has correct anchors for all 5 new sections");

const navHrefs = siteConfig.nav.map((n) => n.href);
const EXPECTED_ANCHORS = ["#past-work", "#reviews", "#pricing", "#faq", "#about"];
for (const anchor of EXPECTED_ANCHORS) {
  assert(
    `nav contains "${anchor}"`,
    navHrefs.includes(anchor),
    `missing; found: ${navHrefs.join(", ")}`,
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
