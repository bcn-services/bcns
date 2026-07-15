/**
 * Structural tests for apps/web/lib/content.ts (A1 QA gate).
 * Runs with: npx tsx apps/web/__tests__/content-registry.test.mjs
 *
 * Checks:
 * 1. siteContent exports all 6 section keys.
 * 2. Each section has the required string fields.
 * 3. Every string field is a [SLOT: ...] placeholder or a step-number neutral default.
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

const SLOT_RE = /^\[SLOT: [^\]]+\]$/;
const STEP_RE = /^0[1-9]$|^[1-9][0-9]$/; // "01", "02", etc.

function isAllowedStringValue(value) {
  return SLOT_RE.test(value) || STEP_RE.test(value);
}

/**
 * Recursively collect all string leaf values from an object/array.
 * Structural keys (href, photo) are excluded — they hold URLs/paths, not copy.
 */
const STRUCTURAL_KEYS = new Set(["href", "photo"]);

function collectStrings(node, path = "", parentKey = "") {
  if (typeof node === "string") {
    if (STRUCTURAL_KEYS.has(parentKey)) return [];
    return [{ path, value: node }];
  }
  if (Array.isArray(node)) {
    return node.flatMap((item, i) => collectStrings(item, `${path}[${i}]`, ""));
  }
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([k, v]) =>
      collectStrings(v, path ? `${path}.${k}` : k, k)
    );
  }
  return [];
}

// ---------------------------------------------------------------------------
// Test 1 — All 6 section keys present
// ---------------------------------------------------------------------------
console.log("\n[1] siteContent exports all 6 section keys");
const REQUIRED_KEYS = [
  "hero",
  "problemSolution",
  "howItWorks",
  "deliveryModels",
  "useCases",
  "contactSection",
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
  problemSolution: ["eyebrow", "title", "description", "items"],
  howItWorks: ["eyebrow", "title", "description", "items"],
  deliveryModels: ["eyebrow", "title", "description", "items"],
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
assert("problemSolution.items is length 3", siteContent.problemSolution.items.length === 3);
assert("howItWorks.items is length 3", siteContent.howItWorks.items.length === 3);
assert("deliveryModels.items is length 3", siteContent.deliveryModels.items.length === 3);
assert("useCases.items is length 4", siteContent.useCases.items.length === 4);
assert("contactSection.highlights is length 3", siteContent.contactSection.highlights.length === 3);

// ---------------------------------------------------------------------------
// Test 4 — All string values are [SLOT:...] or neutral structural defaults
// ---------------------------------------------------------------------------
console.log("\n[4] All string values are [SLOT: ...] placeholders or step-number defaults");
const allStrings = collectStrings(siteContent);
for (const { path, value } of allStrings) {
  assert(
    `${path} = "${value}"`,
    isAllowedStringValue(value),
    `not a SLOT or step number`,
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
