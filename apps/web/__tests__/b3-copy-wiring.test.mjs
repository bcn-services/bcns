/**
 * B3 QA gate: Wire the drafted copy.
 * Run with: npx tsx apps/web/__tests__/b3-copy-wiring.test.mjs
 *
 * Checks:
 * 1. Zero [SLOT: occurrences in content.ts (static analysis)
 * 2. Zero [SLOT: on any rendered page (built HTML)
 * 3. Every [INPUT: string on rendered pages matches appendix-defined tokens
 * 4. Spot-check: hero headline, nav card titles, pricing card names, FAQ q1, /work holding title
 */

import { siteContent } from "../lib/content.ts";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const buildDir = resolve(root, ".next/server/app");

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
// Appendix-defined [INPUT: tokens — every INPUT on a rendered page must be one of these
// ---------------------------------------------------------------------------
const APPENDIX_INPUT_TOKENS = new Set([
  "[INPUT: support window]",
  "[INPUT: response-time promise]",
  "[INPUT: starter price range]",
  "[INPUT: starter turnaround]",
  "[INPUT: full-build price range]",
  "[INPUT: full-build turnaround]",
  "[INPUT: day rate]",
  "[INPUT: starter range]",
  "[INPUT: full range]",
  "[INPUT: typical turnaround summary]",
  "[INPUT: photo]",
  "[INPUT: 1-2 notable projects with concrete outcomes]",
  "[INPUT: credential 2]",
  "[INPUT: credential 3]",
  "[INPUT: business experience summary]",
  "[INPUT: NYU program]",
  "[INPUT: 2-3 sentences — why you two started bcns and what you want it to be]",
  "[INPUT: meta/home-title]",
  "[INPUT: meta/home-description]",
  "[INPUT: meta/services-title]",
  "[INPUT: meta/services-description]",
  "[INPUT: meta/work-title]",
  "[INPUT: meta/work-description]",
  "[INPUT: meta/pricing-title]",
  "[INPUT: meta/pricing-description]",
  "[INPUT: meta/about-title]",
  "[INPUT: meta/about-description]",
]);

// ---------------------------------------------------------------------------
// [1] Zero [SLOT: in content.ts (static)
// ---------------------------------------------------------------------------
console.log("\n[1] content.ts: zero [SLOT: occurrences");

const contentSrc = readFileSync(resolve(root, "lib/content.ts"), "utf8");
const slotCountInContentTs = (contentSrc.match(/\[SLOT:/g) || []).length;

assert(
  "content.ts has zero [SLOT: occurrences",
  slotCountInContentTs === 0,
  `found ${slotCountInContentTs} occurrence(s)`
);

// ---------------------------------------------------------------------------
// [2] Zero [SLOT: on any rendered page (built HTML)
// ---------------------------------------------------------------------------
console.log("\n[2] Rendered pages: zero [SLOT: in built HTML");

const routes = ["index.html", "about.html", "pricing.html", "services.html", "work.html", "privacy.html", "terms.html"];

for (const route of routes) {
  const htmlPath = resolve(buildDir, route);
  let html;
  try {
    html = readFileSync(htmlPath, "utf8");
  } catch {
    assert(`${route} exists in build`, false, `file not found at ${htmlPath}`);
    continue;
  }
  const slotCount = (html.match(/\[SLOT:/g) || []).length;
  assert(
    `${route}: zero [SLOT:`,
    slotCount === 0,
    `found ${slotCount} occurrence(s)`
  );
}

// ---------------------------------------------------------------------------
// [3] Every [INPUT: on rendered pages matches appendix tokens
// ---------------------------------------------------------------------------
console.log("\n[3] Rendered pages: all [INPUT: tokens are appendix-defined");

for (const route of routes) {
  const htmlPath = resolve(buildDir, route);
  let html;
  try {
    html = readFileSync(htmlPath, "utf8");
  } catch {
    continue; // already failed in [2]
  }
  // Extract all [INPUT: ...] occurrences (greedy to closing bracket)
  const inputMatches = html.match(/\[INPUT:[^\]]+\]/g) || [];
  for (const token of inputMatches) {
    assert(
      `${route}: "${token}" is appendix-defined`,
      APPENDIX_INPUT_TOKENS.has(token),
      `unknown INPUT token`
    );
  }
}

// ---------------------------------------------------------------------------
// [4] Spot-checks via registry (static)
// ---------------------------------------------------------------------------
console.log("\n[4] Spot-checks: verbatim values from appendix");

// Hero headline
assert(
  'hero.headline === "Software built around how your business already works"',
  siteContent.hero.headline === "Software built around how your business already works",
  `got: "${siteContent.hero.headline}"`
);

// Nav card titles
const navTitles = siteContent.navCards.items.map((c) => c.title);
assert(
  'navCards[0].title === "What we build"',
  navTitles[0] === "What we build",
  `got: "${navTitles[0]}"`
);
assert(
  'navCards[1].title === "Past work"',
  navTitles[1] === "Past work",
  `got: "${navTitles[1]}"`
);
assert(
  'navCards[2].title === "Pricing"',
  navTitles[2] === "Pricing",
  `got: "${navTitles[2]}"`
);
assert(
  'navCards[3].title === "About"',
  navTitles[3] === "About",
  `got: "${navTitles[3]}"`
);

// Pricing card names
const tierNames = siteContent.pricing.tiers.map((t) => t.name);
assert(
  'pricing.tiers[0].name === "Starter build"',
  tierNames[0] === "Starter build",
  `got: "${tierNames[0]}"`
);
assert(
  'pricing.tiers[1].name === "Full build"',
  tierNames[1] === "Full build",
  `got: "${tierNames[1]}"`
);
assert(
  'pricing.tiers[2].name === "AI consulting"',
  tierNames[2] === "AI consulting",
  `got: "${tierNames[2]}"`
);

// FAQ question 1
assert(
  'faq.items[0].question === "How much will my project cost?"',
  siteContent.faq.items[0].question === "How much will my project cost?",
  `got: "${siteContent.faq.items[0].question}"`
);

// /work holding state title
assert(
  'pastWork.holdingState.title === "Our first builds are in progress"',
  siteContent.pastWork.holdingState.title === "Our first builds are in progress",
  `got: "${siteContent.pastWork.holdingState.title}"`
);

// ---------------------------------------------------------------------------
// [5] Hero headline appears verbatim in built HTML (behavioral)
// ---------------------------------------------------------------------------
console.log("\n[5] Behavioral: hero headline appears in built index.html");

let indexHtml = "";
try {
  indexHtml = readFileSync(resolve(buildDir, "index.html"), "utf8");
} catch {
  assert("index.html readable", false);
}
if (indexHtml) {
  assert(
    'index.html contains hero headline verbatim',
    indexHtml.includes("Software built around how your business already works")
  );
  assert(
    'index.html contains nav card title "What we build"',
    indexHtml.includes("What we build")
  );
  assert(
    'index.html contains nav card title "Pricing"',
    indexHtml.includes("Pricing")
  );
}

// Spot-check /work holding state in built HTML
let workHtml = "";
try {
  workHtml = readFileSync(resolve(buildDir, "work.html"), "utf8");
} catch {
  assert("work.html readable", false);
}
if (workHtml) {
  assert(
    'work.html contains holding state title "Our first builds are in progress"',
    workHtml.includes("Our first builds are in progress")
  );
}

// Spot-check /pricing card names in built HTML
let pricingHtml = "";
try {
  pricingHtml = readFileSync(resolve(buildDir, "pricing.html"), "utf8");
} catch {
  assert("pricing.html readable", false);
}
if (pricingHtml) {
  assert('pricing.html contains "Starter build"', pricingHtml.includes("Starter build"));
  assert('pricing.html contains "Full build"', pricingHtml.includes("Full build"));
  assert('pricing.html contains "AI consulting"', pricingHtml.includes("AI consulting"));
  assert(
    'pricing.html contains FAQ q1',
    pricingHtml.includes("How much will my project cost?")
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
