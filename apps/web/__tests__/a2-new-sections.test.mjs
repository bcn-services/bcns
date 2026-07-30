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
const NEW_KEYS = ["pastWork", "reviews", "pricing", "faq", "about"];
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
console.log("\n[3] Collection arrays are seeded (non-empty) OR a holding state covers the gap");
// pastWork/reviews items are empty pre-launch by design (B2) — the section still
// has to show *something*, so either real items or a populated holdingState must exist.
assert(
  "pastWork has content: non-empty items OR a populated holdingState",
  siteContent.pastWork.items.length >= 1 ||
    Boolean(siteContent.pastWork.holdingState?.title?.length > 0),
  `items=${siteContent.pastWork.items.length}, holdingState=${JSON.stringify(siteContent.pastWork.holdingState)}`,
);
assert(
  "reviews has content: non-empty items OR a populated holdingState",
  siteContent.reviews.items.length >= 1 ||
    Boolean(siteContent.reviews.holdingState?.title?.length > 0),
  `items=${siteContent.reviews.items.length}, holdingState=${JSON.stringify(siteContent.reviews.holdingState)}`,
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
// [4] PastWork and Reviews items use [SLOT: ...] or [INPUT: ...] placeholders
//     (no invented copy)
// ---------------------------------------------------------------------------
console.log("\n[4] PastWork and Reviews items carry [SLOT: ...] or [INPUT: ...] placeholders");
const SLOT_RE = /\[(SLOT|INPUT):/;

// pastWork is filled as of the case-study copy pass, so its fields must now be real
// copy. reviews is still unwritten and keeps the original placeholder guard below.
for (let i = 0; i < siteContent.pastWork.items.length; i++) {
  const { title, outcome } = siteContent.pastWork.items[i];
  assert(
    `pastWork.items[${i}].title is real copy, not a placeholder`,
    !SLOT_RE.test(title) && title.trim().length > 0,
    `got "${title}"`,
  );
  assert(
    `pastWork.items[${i}].outcome is real copy, not a placeholder`,
    !SLOT_RE.test(outcome) && outcome.trim().length > 0,
    `got "${outcome}"`,
  );
}

for (let i = 0; i < siteContent.reviews.items.length; i++) {
  const { quote, author } = siteContent.reviews.items[i];
  assert(
    `reviews.items[${i}].quote is a placeholder`,
    SLOT_RE.test(quote),
    `got "${quote}"`,
  );
  assert(
    `reviews.items[${i}].author is a placeholder`,
    SLOT_RE.test(author),
    `got "${author}"`,
  );
}

// ---------------------------------------------------------------------------
// [5] aboutFounder has required fields
// ---------------------------------------------------------------------------
console.log("\n[5] about has required fields (aboutFounder restructured into about + founders[] in B2)");
assert("about.eyebrow present", "eyebrow" in siteContent.about);
assert("about.title present", "title" in siteContent.about);
assert(
  "about.founders[].bio present on every founder",
  siteContent.about.founders.every((f) => "bio" in f),
);
assert(
  "about.founders[].credentials is an Array on every founder",
  siteContent.about.founders.every((f) => Array.isArray(f.credentials)),
);

// ---------------------------------------------------------------------------
// [6] site.ts nav has all 5 new entries with correct anchors
// ---------------------------------------------------------------------------
// B1 (multi-page routing) replaced the single-page anchor nav this test assumed —
// each of the 5 sections now lives on its own page instead of a homepage anchor,
// so the successor check is "nav routes to the page that hosts the section."
console.log("\n[6] siteConfig.nav routes to the page hosting each of the 5 sections");

const navHrefs = siteConfig.nav.map((n) => n.href);
const SECTION_OWNER_ROUTE = {
  "past-work": "/work",
  reviews: "/work",
  pricing: "/pricing",
  faq: "/pricing",
  about: "/about",
};
for (const [section, route] of Object.entries(SECTION_OWNER_ROUTE)) {
  assert(
    `nav routes to "${route}" (hosts the ${section} section)`,
    navHrefs.includes(route),
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
