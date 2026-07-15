/**
 * A4 QA gate: Legal pages + config scaffolding.
 * Verifies privacy/terms pages, sitemap routes, footer links, and site.ts config.
 * Run with: npx tsx apps/web/__tests__/a4-legal-pages.test.mjs
 */

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
// [1] Privacy page: file exists and contains labeled slot, no real legal text
// ---------------------------------------------------------------------------
console.log("\n[1] Privacy page content");
const privacyPath = resolve(root, "app/privacy/page.tsx");
const privacySource = readFileSync(privacyPath, "utf8");
assert("privacy/page.tsx exists", privacySource.length > 0);
assert(
  "privacy page contains labeled slot",
  privacySource.includes("[PRIVACY POLICY BODY:")
);
assert(
  "privacy page does not contain real legal prose",
  !privacySource.toLowerCase().includes("governing law") &&
    !privacySource.toLowerCase().includes("jurisdiction")
);
assert(
  "privacy page exports default function",
  privacySource.includes("export default function")
);

// ---------------------------------------------------------------------------
// [2] Terms page: file exists and contains labeled slot, no real legal text
// ---------------------------------------------------------------------------
console.log("\n[2] Terms page content");
const termsPath = resolve(root, "app/terms/page.tsx");
const termsSource = readFileSync(termsPath, "utf8");
assert("terms/page.tsx exists", termsSource.length > 0);
assert(
  "terms page contains labeled slot",
  termsSource.includes("[TERMS OF SERVICE BODY:")
);
assert(
  "terms page does not contain real legal prose",
  !termsSource.toLowerCase().includes("governing law") &&
    !termsSource.toLowerCase().includes("jurisdiction")
);
assert(
  "terms page exports default function",
  termsSource.includes("export default function")
);

// ---------------------------------------------------------------------------
// [3] Footer links point to /privacy and /terms (not #)
// ---------------------------------------------------------------------------
console.log("\n[3] Footer href values");
const footerPath = resolve(root, "components/site-footer.tsx");
const footerSource = readFileSync(footerPath, "utf8");
assert(
  'footer has href="/privacy"',
  footerSource.includes('href: "/privacy"') || footerSource.includes('href="/privacy"')
);
assert(
  'footer has href="/terms"',
  footerSource.includes('href: "/terms"') || footerSource.includes('href="/terms"')
);
assert(
  'footer does NOT have href="#" for privacy/terms',
  !footerSource.match(/Privacy.*href:\s*"#"/s) &&
    !footerSource.match(/Terms.*href:\s*"#"/s)
);

// ---------------------------------------------------------------------------
// [4] sitemap.ts includes /privacy and /terms with siteConfig.url base
// ---------------------------------------------------------------------------
console.log("\n[4] Sitemap routes");
const sitemapPath = resolve(root, "app/sitemap.ts");
const sitemapSource = readFileSync(sitemapPath, "utf8");
assert(
  "sitemap includes /privacy route",
  sitemapSource.includes("/privacy")
);
assert(
  "sitemap includes /terms route",
  sitemapSource.includes("/terms")
);
assert(
  "sitemap uses siteConfig.url as base",
  sitemapSource.includes("siteConfig.url")
);
// Both routes should use template literal with siteConfig.url
assert(
  "sitemap privacy uses siteConfig.url template",
  sitemapSource.includes("`${siteConfig.url}/privacy`") ||
    sitemapSource.includes("siteConfig.url + \"/privacy\"") ||
    sitemapSource.includes('siteConfig.url}/privacy')
);
assert(
  "sitemap terms uses siteConfig.url template",
  sitemapSource.includes("`${siteConfig.url}/terms`") ||
    sitemapSource.includes("siteConfig.url + \"/terms\"") ||
    sitemapSource.includes('siteConfig.url}/terms')
);

// ---------------------------------------------------------------------------
// [5] site.ts: name is "bcns", domain/email/url are placeholder constants with TODO
// ---------------------------------------------------------------------------
console.log("\n[5] site.ts config shape");
const sitePath = resolve(root, "lib/site.ts");
const siteSource = readFileSync(sitePath, "utf8");
assert('site.ts has name: "bcns"', siteSource.includes('"bcns"'));
assert("site.ts has domain field", siteSource.includes("domain:"));
assert("site.ts has email field", siteSource.includes("email:"));
assert("site.ts has url field", siteSource.includes("url:"));
assert("site.ts has TODO comments", siteSource.includes("TODO"));

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
