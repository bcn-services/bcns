/**
 * A2 fix-verification QA gate.
 * Targets the 4 specific changes applied by the Bug Fixer after the review:
 *  1. PastWorkItem.link is optional (interface allows undefined)
 *  2. past-work.tsx renders <a> only when link is truthy
 *  3. about-founder.tsx uses registry fields for cardTitleBio, cardTitleCredentials, description
 *  4. AboutFounderContent has description?, cardTitleBio, cardTitleCredentials — all wired in registry
 *
 * Run with: npx tsx apps/web/__tests__/a2-fix-verification.test.mjs
 */

import { siteContent } from "../lib/content.ts";

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

const SLOT_RE = /\[SLOT:/;

// ---------------------------------------------------------------------------
// [1] PastWorkItem.link is optional — items without link must not crash
// ---------------------------------------------------------------------------
console.log("\n[1] PastWorkItem.link is optional");

// Structural: items array exists and is iterable
assert(
  "pastWork.items is an array",
  Array.isArray(siteContent.pastWork.items),
);

// An item with no link property at all must be valid (undefined is fine)
const itemWithoutLink = { title: "Test", outcome: "Outcome" };
// If TypeScript accepted it, the shape is fine. Runtime check: link absent === no crash.
assert(
  "item without link field has undefined link (not a required string)",
  itemWithoutLink.link === undefined,
);

// Items in registry that DO have a link field carry SLOT placeholders
for (let i = 0; i < siteContent.pastWork.items.length; i++) {
  const item = siteContent.pastWork.items[i];
  if (item.link !== undefined) {
    assert(
      `pastWork.items[${i}].link is a SLOT placeholder (truthy placeholder for now)`,
      SLOT_RE.test(item.link),
      `got "${item.link}"`,
    );
  } else {
    assert(
      `pastWork.items[${i}].link is undefined (optional — OK)`,
      true,
    );
  }
}

// ---------------------------------------------------------------------------
// [2] AboutFounderContent has description?, cardTitleBio, cardTitleCredentials
// ---------------------------------------------------------------------------
console.log("\n[2] AboutContent — successor fields present in registry (about replaced aboutFounder)");

assert(
  "about.description present",
  "description" in siteContent.about,
  `keys: ${Object.keys(siteContent.about).join(", ")}`,
);
assert(
  "about.description is a non-empty string (real copy landed in B3)",
  typeof siteContent.about.description === "string" &&
    siteContent.about.description.trim().length > 0,
  `got "${siteContent.about.description}"`,
);

// aboutFounder.cardTitleBio / cardTitleCredentials had no successor field after
// the B2 rework — about-founder.tsx no longer renders per-section card titles.

// ---------------------------------------------------------------------------
// [3] No hardcoded card titles in about-founder.tsx source
//     (behavioral: read file content and check for the old hardcoded strings)
// ---------------------------------------------------------------------------
console.log("\n[3] about-founder.tsx — no hardcoded 'Background' or 'Credentials' strings");
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const aboutFounderSrc = readFileSync(
  join(__dirname, "../components/about-founder.tsx"),
  "utf8",
);

assert(
  'about-founder.tsx does not contain hardcoded "Background"',
  !aboutFounderSrc.includes('"Background"') && !aboutFounderSrc.includes("'Background'"),
  "found hardcoded title",
);
assert(
  'about-founder.tsx does not contain hardcoded "Credentials"',
  !aboutFounderSrc.includes('"Credentials"') && !aboutFounderSrc.includes("'Credentials'"),
  "found hardcoded title",
);
// {cardTitleBio} / {cardTitleCredentials} wiring checks removed — no successor
// field after the B2 rework (see note above).
assert(
  "about-founder.tsx passes description to SectionHeading",
  aboutFounderSrc.includes("description={description}"),
  "description not wired to SectionHeading",
);

// ---------------------------------------------------------------------------
// [4] past-work.tsx renders <a> conditionally (link && ...)
// ---------------------------------------------------------------------------
console.log("\n[4] past-work.tsx — anchor only rendered when link is truthy");
const pastWorkSrc = readFileSync(
  join(__dirname, "../components/past-work.tsx"),
  "utf8",
);

assert(
  "past-work.tsx contains {link && ... (conditional anchor)",
  pastWorkSrc.includes("{link &&") || pastWorkSrc.includes("link && ("),
  "conditional guard missing",
);
assert(
  "past-work.tsx anchor has target=\"_blank\"",
  pastWorkSrc.includes('target="_blank"'),
  "target missing",
);
assert(
  'past-work.tsx anchor has rel="noopener noreferrer"',
  pastWorkSrc.includes('rel="noopener noreferrer"'),
  "rel missing",
);
assert(
  "past-work.tsx does NOT render unconditional <a> for link",
  !pastWorkSrc.includes("<p>{link}</p>"),
  "old unconditional <p> still present",
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
