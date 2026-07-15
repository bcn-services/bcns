/**
 * B4 QA gate: CONTENT.md + trackers updated.
 * Run with: npx tsx apps/web/__tests__/b4-content-md.test.mjs
 *
 * Checks:
 * 1. Every top-level string field name in SiteContent appears in CONTENT.md
 * 2. CONTENT.md contains the /work flip instruction text
 * 3. CONTENT.md contains [INPUT: documentation (the convention explanation)
 */

import { siteContent } from "../lib/content.ts";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const contentMdPath = resolve(root, "CONTENT.md");

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

// Read CONTENT.md
let contentMd;
try {
  contentMd = readFileSync(contentMdPath, "utf8");
} catch (e) {
  console.error("FATAL: Could not read CONTENT.md —", e.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Test 1: Every top-level section key in siteContent appears in CONTENT.md
// ---------------------------------------------------------------------------
console.log("\n--- Test 1: top-level section keys in CONTENT.md ---");

const sectionKeys = Object.keys(siteContent);
// These are the registry top-level keys: hero, howItWorks, useCases, etc.
for (const key of sectionKeys) {
  // CONTENT.md documents each section; the key should appear at least once
  assert(
    `siteContent.${key} mentioned in CONTENT.md`,
    contentMd.includes(key),
    `"${key}" not found anywhere in CONTENT.md`
  );
}

// ---------------------------------------------------------------------------
// Test 2: Key string field names from leaf interfaces appear in CONTENT.md
// ---------------------------------------------------------------------------
console.log("\n--- Test 2: leaf string field names appear in CONTENT.md ---");

// Representative sampling of all interface field names across the registry
const fieldNames = [
  // HeroContent
  "badge", "headline", "subheadline", "ctaPrimary", "ctaSecondary", "proofPoints",
  // HowItWorksContent / StepItem
  "eyebrow", "title", "description", "items", "step",
  // UseCasesContent / UseCaseItem
  "tag",
  // ContactSectionContent / ContactHighlightItem
  "highlights",
  // PastWorkContent / PastWorkItem
  "outcome", "link", "holdingState",
  // ReviewsContent / ReviewItem
  "quote", "author", "role", "company",
  // PricingContent / PricingTier
  "tiers", "price", "features",
  // FaqContent / FaqItem
  "question", "answer",
  // AboutContent / FounderItem
  "founders", "roleLine", "photo", "bio", "credentials", "whyBcns",
  // NavCardsContent / NavCardItem
  "navCards", "href",
  // PageMetaRegistry / PageMeta
  "pageMeta",
];

for (const field of fieldNames) {
  assert(
    `field "${field}" documented in CONTENT.md`,
    contentMd.includes(field),
    `"${field}" not found in CONTENT.md`
  );
}

// ---------------------------------------------------------------------------
// Test 3: /work flip instruction is documented
// ---------------------------------------------------------------------------
console.log("\n--- Test 3: /work flip instruction documented ---");

// The criteria say: "add an entry to pastWork.items — holding state disappears"
// Normalize CONTENT.md to collapse line-wrapped phrases for phrase matching
const contentMdNormalized = contentMd.replace(/\n/g, " ");

const flipPhrases = [
  "pastWork.items",
  "holding state disappears automatically",
];
for (const phrase of flipPhrases) {
  assert(
    `flip instruction contains "${phrase}"`,
    contentMdNormalized.includes(phrase),
    `Phrase not found: "${phrase}"`
  );
}

// ---------------------------------------------------------------------------
// Test 4: [INPUT: …] convention is documented
// ---------------------------------------------------------------------------
console.log("\n--- Test 4: [INPUT: …] convention documented ---");

assert(
  'CONTENT.md contains "[INPUT:" section header or explanation',
  contentMd.includes("[INPUT:"),
  '"[INPUT:" not found in CONTENT.md'
);

// Check that the convention explanation exists (not just placeholders)
assert(
  "CONTENT.md explains what [INPUT: …] strings are",
  contentMd.includes("INPUT") && contentMd.includes("placeholder"),
  'No explanation of [INPUT: placeholder convention found'
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log("ALL PASS");
  process.exit(0);
}
