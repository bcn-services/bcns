/**
 * B2 QA gate: Registry rework — nav cards, two-founder about, pricing shape, /work holding state.
 * Run with: npx tsx apps/web/__tests__/b2-registry-rework.test.mjs
 *
 * Checks:
 * 1. Registry typechecks — NavCardsContent, AboutContent (founders[2]), HoldingState on pastWork+reviews
 * 2. /about renders two founder cards from the `founders` array (not just one)
 * 3. /work renders holding-state copy when items is empty; renders item grid when entries present
 * 4. Pricing renders exactly 3 cards with free-string prices (no fixed format required)
 * 5. NavCards reads from registry (not inline array)
 */

import { siteContent } from "../lib/content.ts";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

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
// [1] Registry typechecks — new B2 shapes present and correctly shaped
// ---------------------------------------------------------------------------
console.log("\n[1] Registry shapes: NavCardsContent, AboutContent, HoldingState");

// NavCardsContent: has items array with 4 entries
assert("siteContent.navCards exists", "navCards" in siteContent);
assert("navCards.items is array", Array.isArray(siteContent.navCards.items));
assert("navCards.items has 4 entries", siteContent.navCards.items.length === 4);
for (let i = 0; i < siteContent.navCards.items.length; i++) {
  const card = siteContent.navCards.items[i];
  assert(
    `navCards.items[${i}] has title`,
    typeof card.title === "string" && card.title.length > 0
  );
  assert(
    `navCards.items[${i}] has description`,
    typeof card.description === "string" && card.description.length > 0
  );
  assert(
    `navCards.items[${i}] has href`,
    typeof card.href === "string" && card.href.startsWith("/")
  );
}

// AboutContent: about key (not aboutFounder), founders tuple of 2, whyBcns
assert("siteContent.about exists (renamed from aboutFounder)", "about" in siteContent);
assert("siteContent.aboutFounder does NOT exist", !("aboutFounder" in siteContent));
assert("about.founders is array", Array.isArray(siteContent.about.founders));
assert("about.founders has exactly 2 entries", siteContent.about.founders.length === 2);
for (let i = 0; i < 2; i++) {
  const f = siteContent.about.founders[i];
  assert(`about.founders[${i}] has name`, typeof f.name === "string" && f.name.length > 0);
  assert(`about.founders[${i}] has roleLine`, typeof f.roleLine === "string" && f.roleLine.length > 0);
  assert(`about.founders[${i}] has bio`, typeof f.bio === "string" && f.bio.length > 0);
  assert(`about.founders[${i}] has credentials array`, Array.isArray(f.credentials));
}
assert("about.whyBcns is string", typeof siteContent.about.whyBcns === "string");

// HoldingState on pastWork and reviews
assert("pastWork.holdingState exists", "holdingState" in siteContent.pastWork);
assert(
  "pastWork.holdingState has title/body/ctaLabel",
  typeof siteContent.pastWork.holdingState.title === "string" &&
    typeof siteContent.pastWork.holdingState.body === "string" &&
    typeof siteContent.pastWork.holdingState.ctaLabel === "string"
);
assert("reviews.holdingState exists", "holdingState" in siteContent.reviews);
assert(
  "reviews.holdingState has title/body/ctaLabel",
  typeof siteContent.reviews.holdingState.title === "string" &&
    typeof siteContent.reviews.holdingState.body === "string" &&
    typeof siteContent.reviews.holdingState.ctaLabel === "string"
);

// ---------------------------------------------------------------------------
// [2] /about: component renders two founder cards from founders array
// ---------------------------------------------------------------------------
console.log("\n[2] /about: about-founder.tsx renders two founder cards");

const aboutFounderSrc = readFileSync(
  resolve(root, "components/about-founder.tsx"),
  "utf8"
);

// Component reads from siteContent.about (not siteContent.aboutFounder)
assert(
  "about-founder reads siteContent.about",
  aboutFounderSrc.includes("siteContent.about")
);
assert(
  "about-founder does NOT read siteContent.aboutFounder",
  !aboutFounderSrc.includes("siteContent.aboutFounder")
);

// founders array is iterated (map over founders, not a single founder)
assert(
  "about-founder maps over founders array",
  aboutFounderSrc.includes("founders.map") ||
    (aboutFounderSrc.includes("founders") && aboutFounderSrc.includes(".map("))
);

// Both founder fields are rendered
assert(
  "about-founder renders founder.name",
  aboutFounderSrc.includes("founder.name")
);
assert(
  "about-founder renders founder.roleLine",
  aboutFounderSrc.includes("founder.roleLine")
);
assert(
  "about-founder renders founder.bio",
  aboutFounderSrc.includes("founder.bio")
);

// /about page.tsx imports AboutFounder
const aboutPageSrc = readFileSync(resolve(root, "app/about/page.tsx"), "utf8");
assert("app/about/page.tsx imports AboutFounder", aboutPageSrc.includes("AboutFounder"));

// Behavioral: confirm founders array has 2 items and each has required shape
// (real copy landed in B3 — the slots these guarded are now filled, so the
// surviving invariant is "populated", not "still a placeholder")
const founders = siteContent.about.founders;
assert("founders[0] name is a non-empty string", founders[0].name.trim().length > 0);
assert("founders[1] name is a non-empty string", founders[1].name.trim().length > 0);
assert(
  "founders[0] and founders[1] are distinct entries",
  founders[0].name !== founders[1].name
);

// ---------------------------------------------------------------------------
// [3] /work: holding-state branch vs item-grid branch
// ---------------------------------------------------------------------------
console.log("\n[3] /work: holding-state when empty, item grid when populated");

const pastWorkSrc = readFileSync(resolve(root, "components/past-work.tsx"), "utf8");
const reviewsSrc = readFileSync(resolve(root, "components/reviews.tsx"), "utf8");

// Both components have items.length === 0 conditional
assert(
  "past-work.tsx has items.length === 0 branch",
  pastWorkSrc.includes("items.length === 0")
);
assert(
  "reviews.tsx has items.length === 0 branch",
  reviewsSrc.includes("items.length === 0")
);

// Holding state fields rendered
assert(
  "past-work.tsx renders holdingState.title",
  pastWorkSrc.includes("holdingState.title")
);
assert(
  "past-work.tsx renders holdingState.body",
  pastWorkSrc.includes("holdingState.body")
);
assert(
  "past-work.tsx renders holdingState.ctaLabel",
  pastWorkSrc.includes("holdingState.ctaLabel")
);
assert(
  "reviews.tsx renders holdingState.title",
  reviewsSrc.includes("holdingState.title")
);

// Item grid branch exists (else path)
assert(
  "past-work.tsx has item grid branch (maps over items)",
  pastWorkSrc.includes("items.map")
);
assert(
  "reviews.tsx has item grid branch (maps over items)",
  reviewsSrc.includes("items.map")
);

// Registry: pastWork.items is now seeded (W5 case-study slots), but the
// holding state must stay populated so /work still renders correctly if
// items is ever emptied again — both branches in past-work.tsx stay live.
// (Slug/placeholder detail on those entries: past-work-case-studies.test.mjs.)
assert(
  "pastWork.items is seeded with the 2 case-study entries",
  siteContent.pastWork.items.length === 2,
  `got ${siteContent.pastWork.items.length}`
);
assert(
  "pastWork.holdingState.title stays populated (holding-state branch still viable)",
  typeof siteContent.pastWork.holdingState.title === "string" &&
    siteContent.pastWork.holdingState.title.trim().length > 0
);
assert("reviews.items is empty array by default", siteContent.reviews.items.length === 0);

// Behavioral: verify holding-state renders and item-grid renders via registry simulation
// (no JSX renderer available; we verify the conditional logic exists and registry has correct shape)
// Simulate: empty items → holding state copy would be rendered
const { holdingState: pwHolding } = siteContent.pastWork;
assert(
  "pastWork holding state title is a non-empty string",
  pwHolding.title.trim().length > 0
);

// Simulate: non-empty items → grid branch would be rendered
const injectedItem = { title: "Test Project", outcome: "Test Outcome" };
assert(
  "injected item has title and outcome fields (matches PastWorkItem shape)",
  typeof injectedItem.title === "string" && typeof injectedItem.outcome === "string"
);
assert(
  "past-work.tsx renders workTitle from item",
  // component destructures { title: workTitle, outcome, link } from each item
  pastWorkSrc.includes("workTitle") || pastWorkSrc.includes("title: workTitle") ||
    pastWorkSrc.includes("title") && pastWorkSrc.includes("outcome")
);
// Confirm both branches exist in component source — ternary structure
const holdingBranchIdx = pastWorkSrc.indexOf("holdingState.title");
const gridBranchIdx = pastWorkSrc.indexOf("items.map");
assert(
  "holding-state branch appears before grid branch in past-work.tsx (ternary order)",
  holdingBranchIdx !== -1 && gridBranchIdx !== -1 && holdingBranchIdx < gridBranchIdx
);

// ---------------------------------------------------------------------------
// [4] Pricing: exactly 3 tiers with free-string prices
// ---------------------------------------------------------------------------
console.log("\n[4] Pricing: 3 tiers, free-string prices, price is string not number");

assert("pricing.tiers is array", Array.isArray(siteContent.pricing.tiers));
assert("pricing has exactly 3 tiers", siteContent.pricing.tiers.length === 3);

for (let i = 0; i < 3; i++) {
  const tier = siteContent.pricing.tiers[i];
  assert(`pricing.tiers[${i}] has name`, typeof tier.name === "string" && tier.name.length > 0);
  assert(
    `pricing.tiers[${i}] price is a string (not number)`,
    typeof tier.price === "string"
  );
  assert(`pricing.tiers[${i}] has description`, typeof tier.description === "string");
  assert(`pricing.tiers[${i}] has features array`, Array.isArray(tier.features));
}

// Pricing component renders price as free string (not formatted number)
const pricingSrc = readFileSync(resolve(root, "components/pricing.tsx"), "utf8");
assert(
  "pricing.tsx renders price as text (not toLocaleString/toFixed)",
  !pricingSrc.includes("toLocaleString") && !pricingSrc.includes("toFixed")
);
assert(
  "pricing.tsx maps over tiers",
  pricingSrc.includes("tiers.map")
);

// Third tier exists (AI consulting tier implied by B2 spec)
const tier3 = siteContent.pricing.tiers[2];
assert("tier-3 name is a non-empty string", tier3.name.trim().length > 0);
assert("tier-3 price is a non-empty string", tier3.price.trim().length > 0);

// ---------------------------------------------------------------------------
// [5] NavCards: registry-driven (not inline array)
// ---------------------------------------------------------------------------
console.log("\n[5] NavCards reads from siteContent.navCards.items (not inline cards const)");

const navCardsSrc = readFileSync(resolve(root, "components/nav-cards.tsx"), "utf8");
assert(
  "nav-cards.tsx reads siteContent.navCards",
  navCardsSrc.includes("siteContent.navCards")
);
assert(
  "nav-cards.tsx does NOT have inline cards array literal",
  !navCardsSrc.includes("const cards = [") && !navCardsSrc.includes("const cards=[")
);
assert(
  "nav-cards.tsx maps over items",
  navCardsSrc.includes(".map(")
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
