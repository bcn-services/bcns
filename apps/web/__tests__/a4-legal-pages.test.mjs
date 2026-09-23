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

const contentPath = resolve(root, "lib/content.ts");
const contentSource = readFileSync(contentPath, "utf8");
// Isolate the `legal: { ... }` block so assertions below can't accidentally
// match unrelated copy elsewhere in the registry.
const legalBlock = contentSource.slice(
  contentSource.indexOf("legal: {"),
  contentSource.indexOf("\n  navCards: {")
);

const FORBIDDEN_PHRASES = [
  "bank-grade",
  "military-grade",
  "SOC 2",
  "GDPR compliant",
  "guaranteed uptime",
];

const REQUIRED_PRIVACY_HEADINGS = [
  "Who we are",
  "What we collect",
  "How we use it",
  "AI tools and MCP",
  "Who we share it with",
  "How long we keep it",
  "Requesting deletion",
  "Security",
  "Your rights",
  "Where your data is stored",
  "Cookies and Do Not Track",
  "Children",
  "Contact us",
];

const REQUIRED_TERMS_HEADINGS = [
  "Agreement and acceptance",
  "Definitions",
  "The services",
  "Fees and billing",
  "Limitation of liability",
  "Governing law and venue",
  "Contact us",
];

// ---------------------------------------------------------------------------
// [1] Privacy page: renders from content.ts, real section headings present,
// no placeholder text left over
// ---------------------------------------------------------------------------
console.log("\n[1] Privacy page content");
const privacyPath = resolve(root, "app/privacy/page.tsx");
const privacySource = readFileSync(privacyPath, "utf8");
assert("privacy/page.tsx exists", privacySource.length > 0);
assert(
  "privacy page renders siteContent.legal.privacy",
  privacySource.includes("siteContent.legal") && privacySource.includes("privacy")
);
assert(
  "privacy page has no leftover placeholder body",
  !privacySource.includes("[PRIVACY POLICY BODY:")
);
assert(
  "privacy page exports default function",
  privacySource.includes("export default function")
);
for (const heading of REQUIRED_PRIVACY_HEADINGS) {
  assert(`content.ts privacy has heading "${heading}"`, legalBlock.includes(`"${heading}"`));
}
assert(
  "privacy retention text says 30 days",
  /30 days|Thirty days/.test(legalBlock)
);

// ---------------------------------------------------------------------------
// [2] Terms page: renders from content.ts, real section headings present,
// no placeholder text left over
// ---------------------------------------------------------------------------
console.log("\n[2] Terms page content");
const termsPath = resolve(root, "app/terms/page.tsx");
const termsSource = readFileSync(termsPath, "utf8");
assert("terms/page.tsx exists", termsSource.length > 0);
assert(
  "terms page renders siteContent.legal.terms",
  termsSource.includes("siteContent.legal") && termsSource.includes("terms")
);
assert(
  "terms page has no leftover placeholder body",
  !termsSource.includes("[TERMS OF SERVICE BODY:")
);
assert(
  "terms page exports default function",
  termsSource.includes("export default function")
);
for (const heading of REQUIRED_TERMS_HEADINGS) {
  assert(`content.ts terms has heading "${heading}"`, legalBlock.includes(`"${heading}"`));
}

// ---------------------------------------------------------------------------
// [1b/2b] No forbidden statements anywhere in the legal copy
// ---------------------------------------------------------------------------
console.log("\n[1b] Forbidden phrases absent from legal copy");
for (const phrase of FORBIDDEN_PHRASES) {
  assert(
    `legal copy does not contain "${phrase}"`,
    !legalBlock.toLowerCase().includes(phrase.toLowerCase())
  );
}

// ---------------------------------------------------------------------------
// [2b] Every unresolved fact is a visible [TODO: ...], never a silent gap.
// As of the legal-todos-fill pass, all facts are resolved, so none should
// remain; if a future edit reintroduces a gap it must still be bracketed.
// ---------------------------------------------------------------------------
console.log("\n[2b] TODO placeholders are visibly wrapped");
// A bare "TODO" with no brackets would render as a naked, non-obvious gap.
const bareTodo = legalBlock.match(/(?<!\[)TODO(?!:[^\]]*\])/g) || [];
assert(
  "no unbracketed TODO in legal copy",
  bareTodo.length === 0,
  `found: ${JSON.stringify(bareTodo)}`
);

// ---------------------------------------------------------------------------
// [2c] All facts resolved: no [TODO placeholders left in the rendered
// /privacy or /terms output (legal-todos-fill closed the last 6)
// ---------------------------------------------------------------------------
console.log("\n[2c] No [TODO placeholders remain in privacy/terms output");
const privacyLegalBlock = legalBlock.slice(
  legalBlock.indexOf("privacy: {"),
  legalBlock.indexOf("\n    terms: {")
);
const termsLegalBlock = legalBlock.slice(legalBlock.indexOf("\n    terms: {"));
assert(
  "rendered /privacy output contains no [TODO",
  !privacyLegalBlock.includes("[TODO"),
  `found: ${JSON.stringify(privacyLegalBlock.match(/\[TODO[^\]]*\]/g) || [])}`
);
assert(
  "rendered /terms output contains no [TODO",
  !termsLegalBlock.includes("[TODO"),
  `found: ${JSON.stringify(termsLegalBlock.match(/\[TODO[^\]]*\]/g) || [])}`
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
