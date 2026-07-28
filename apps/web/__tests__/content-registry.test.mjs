/**
 * Structural tests for apps/web/lib/content.ts (A1 QA gate).
 * Runs with: npx tsx apps/web/__tests__/content-registry.test.mjs
 *
 * Checks:
 * 1. siteContent exports all 6 section keys.
 * 2. Each section has the required string fields.
 * 3. Every string field is non-empty (real copy landed in B3; SLOT/step placeholders still allowed).
 * 4. siteConfig (site.ts) is NOT duplicated inside content.ts.
 */

import { siteContent } from "../lib/content.ts";
import { siteConfig } from "../lib/site.ts";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
// Helpers
// ---------------------------------------------------------------------------

// B3 landed real copy across the registry (content-freeze), so the old
// SLOT-or-step-number invariant no longer holds — real prose is the expected
// value now. What still matters: no field ships silently empty. (A [SLOT: ...]
// or step-number string is non-empty too, so it still passes.)
function isAllowedStringValue(value) {
  return value.trim().length > 0;
}

/**
 * Recursively collect all string leaf values from an object/array.
 * Structural keys (href, photo) are excluded — they hold URLs/paths, not copy.
 */
function collectStrings(node, path = "") {
  if (typeof node === "string") {
    if (path.endsWith(".href") || path.endsWith(".photo")) return [];
    return [{ path, value: node }];
  }
  if (Array.isArray(node)) {
    return node.flatMap((item, i) => collectStrings(item, `${path}[${i}]`));
  }
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([k, v]) =>
      collectStrings(v, path ? `${path}.${k}` : k)
    );
  }
  return [];
}

// ---------------------------------------------------------------------------
// Test 1 — All 6 section keys present
// ---------------------------------------------------------------------------
console.log("\n[1] siteContent exports all section keys");
const REQUIRED_KEYS = [
  "hero",
  "howItWorks",
  "useCases",
  "contactSection",
  "pastWork",
  "reviews",
  "pricing",
  "faq",
  "about",
  "navCards",
  "pageMeta",
];
for (const key of REQUIRED_KEYS) {
  assert(`siteContent.${key} exists`, key in siteContent);
}

// ---------------------------------------------------------------------------
// Test 2 — Required fields per section
// ---------------------------------------------------------------------------
console.log("\n[2] Each section has required string fields");

const SECTION_REQUIRED_FIELDS = {
  hero: ["badge", "headline", "subheadline", "ctaPrimary", "ctaSecondary", "proofPoints"],
  howItWorks: ["eyebrow", "title", "description", "items"],
  useCases: ["eyebrow", "title", "description", "items"],
  contactSection: ["eyebrow", "title", "description", "highlights"],
};

for (const [section, fields] of Object.entries(SECTION_REQUIRED_FIELDS)) {
  for (const field of fields) {
    assert(
      `siteContent.${section}.${field} present`,
      field in siteContent[section],
    );
  }
}

// ---------------------------------------------------------------------------
// Test 3 — Tuple array lengths
// ---------------------------------------------------------------------------
console.log("\n[3] Tuple arrays have correct lengths");
assert("hero.proofPoints is length 3", siteContent.hero.proofPoints.length === 3);
assert("howItWorks.items is length 3", siteContent.howItWorks.items.length === 3);
assert("useCases.items is length 4", siteContent.useCases.items.length === 4);
assert("contactSection.highlights is length 3", siteContent.contactSection.highlights.length === 3);

// ---------------------------------------------------------------------------
// Test 4 — No string value ships empty
// ---------------------------------------------------------------------------
console.log("\n[4] All string values are non-empty (SLOT/step placeholders still allowed)");
const allStrings = collectStrings(siteContent);
for (const { path, value } of allStrings) {
  assert(
    `${path} = "${value}"`,
    isAllowedStringValue(value),
    `empty or whitespace-only string`,
  );
}

// ---------------------------------------------------------------------------
// Test 5 — siteConfig values not duplicated in content.ts
// ---------------------------------------------------------------------------
console.log("\n[5] siteConfig.name / .domain / .email not duplicated in content.ts");
const contentSrc = readFileSync(
  join(__dirname, "../lib/content.ts"),
  "utf8",
);
assert(
  "siteConfig.name not in content.ts",
  !contentSrc.includes(`"${siteConfig.name}"`),
  `found "${siteConfig.name}" literal in content.ts`,
);
assert(
  "siteConfig.domain not in content.ts",
  !contentSrc.includes(`"${siteConfig.domain}"`),
  `found "${siteConfig.domain}" literal in content.ts`,
);
assert(
  "siteConfig.email not in content.ts",
  !contentSrc.includes(`"${siteConfig.email}"`),
  `found "${siteConfig.email}" literal in content.ts`,
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
