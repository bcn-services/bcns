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
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const buildDir = resolve(root, ".next/server/app");
const buildExists = existsSync(buildDir);

// The layout-loop can wrap individual words of rendered copy in an inline
// <span> (e.g. an accent word in the headline) — a raw includes() on HTML
// breaks the moment that happens even though the copy is correct and present.
// Strip tags first so literal checks assert on rendered text, not raw markup.
const stripTags = (html) => html.replace(/<[^>]+>/g, "");

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  FAIL: ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

// `pnpm --filter web test` alone never builds; `pnpm test` (Turbo) always builds
// first. Degrade to a loud skip instead of a false red when run standalone
// against a clean tree with no .next output — the real gate (Turbo) still runs it.
function skipSection(name) {
  skipped++;
  const msg = `SKIPPING: ${name} — build output not found at ${buildDir}. Run \`pnpm build\` first, or run \`pnpm test\` from the repo root (Turbo builds before testing).`;
  console.error(`\n  ⚠️  ${msg}\n`);
  console.log(`# SKIP ${msg}`);
}

// ---------------------------------------------------------------------------
// Appendix-defined [INPUT: tokens — every INPUT on a rendered page must be one of these
// ---------------------------------------------------------------------------
// C1 pass: these resolved slots are now filled. Only Needs-Nate slots remain.
const APPENDIX_INPUT_TOKENS = new Set([
  // C1 pass: all pricing/turnaround/response-time/meta slots are now filled.
  // Only Needs-Nate slots remain as [INPUT: ...].
  "[INPUT: photo]",
  "[INPUT: credential 2]",
  "[INPUT: credential 3]",
  "[INPUT: business experience summary]",
  "[INPUT: NYU program]",
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

if (!buildExists) {
  skipSection("[2] Rendered pages: zero [SLOT: in built HTML");
} else {
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
}

// ---------------------------------------------------------------------------
// [3] Every [INPUT: on rendered pages matches appendix tokens
// ---------------------------------------------------------------------------
console.log("\n[3] Rendered pages: all [INPUT: tokens are appendix-defined");

if (!buildExists) {
  skipSection("[3] Rendered pages: all [INPUT: tokens are appendix-defined");
} else {
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
  'pricing.tiers[0].name === "Standard build"',
  tierNames[0] === "Standard build",
  `got: "${tierNames[0]}"`
);
assert(
  'pricing.tiers[1].name === "Advanced build"',
  tierNames[1] === "Advanced build",
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

if (!buildExists) {
  skipSection("[5] Behavioral: hero headline / nav card titles / holding title / pricing names appear in built HTML");
} else {
  let indexHtml = "";
  try {
    indexHtml = readFileSync(resolve(buildDir, "index.html"), "utf8");
  } catch {
    assert("index.html readable", false);
  }
  if (indexHtml) {
    const indexText = stripTags(indexHtml);
    assert(
      'index.html contains hero headline verbatim',
      indexText.includes("Software built around how your business already works")
    );
    assert(
      'index.html contains nav card title "What we build"',
      indexText.includes("What we build")
    );
    assert(
      'index.html contains nav card title "Pricing"',
      indexText.includes("Pricing")
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
      stripTags(workHtml).includes("Our first builds are in progress")
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
    const pricingText = stripTags(pricingHtml);
    assert('pricing.html contains "Standard build"', pricingText.includes("Standard build"));
    assert('pricing.html contains "Advanced build"', pricingText.includes("Advanced build"));
    assert('pricing.html contains "AI consulting"', pricingText.includes("AI consulting"));
    assert(
      'pricing.html contains FAQ q1',
      pricingText.includes("How much will my project cost?")
    );
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped`);
if (failed > 0) {
  process.exit(1);
}
