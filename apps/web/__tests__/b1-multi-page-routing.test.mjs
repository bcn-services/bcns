/**
 * B1 QA gate: Multi-page routing + thin home.
 * Verifies all routes exist, home is thin (hero + nav-cards + contact),
 * problem-solution/delivery-models absent, nav is page-route links in order,
 * and sitemap lists all routes.
 * Run with: npx tsx apps/web/__tests__/b1-multi-page-routing.test.mjs
 */

import { readFileSync } from "fs";
import { existsSync } from "fs";
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
// [1] Route files exist
// ---------------------------------------------------------------------------
console.log("\n[1] Route page files exist");
const routes = ["services", "pricing", "about", "work"];
for (const route of routes) {
  const pagePath = resolve(root, `app/${route}/page.tsx`);
  assert(`app/${route}/page.tsx exists`, existsSync(pagePath));
}
// Legal pages pre-existing
assert("app/privacy/page.tsx exists", existsSync(resolve(root, "app/privacy/page.tsx")));
assert("app/terms/page.tsx exists", existsSync(resolve(root, "app/terms/page.tsx")));

// ---------------------------------------------------------------------------
// [2] Home page: only Hero + NavCards + ContactSection (no forbidden sections)
// ---------------------------------------------------------------------------
console.log("\n[2] Home page is thin — hero + nav-cards + contact only");
const homeSrc = readFileSync(resolve(root, "app/page.tsx"), "utf8");
assert("home imports Hero", homeSrc.includes("Hero"));
assert("home imports NavCards", homeSrc.includes("NavCards"));
assert("home imports ContactSection", homeSrc.includes("ContactSection"));
assert("home does NOT import ProblemSolution", !homeSrc.includes("ProblemSolution"));
assert("home does NOT import DeliveryModels", !homeSrc.includes("DeliveryModels"));
assert("home does NOT import HowItWorks", !homeSrc.includes("HowItWorks"));
assert("home does NOT import Pricing", !homeSrc.includes("Pricing"));
assert("home does NOT import Faq", !homeSrc.includes("Faq"));
assert("home does NOT import AboutFounder", !homeSrc.includes("AboutFounder"));
assert("home does NOT import PastWork", !homeSrc.includes("PastWork"));
assert("home does NOT import Reviews", !homeSrc.includes("Reviews"));

// ---------------------------------------------------------------------------
// [3] Problem-solution and delivery-models absent from ALL page files
// ---------------------------------------------------------------------------
console.log("\n[3] ProblemSolution + DeliveryModels absent from all pages");
const allPageFiles = [
  "app/page.tsx",
  "app/services/page.tsx",
  "app/pricing/page.tsx",
  "app/about/page.tsx",
  "app/work/page.tsx",
  "app/privacy/page.tsx",
  "app/terms/page.tsx",
];
for (const rel of allPageFiles) {
  const src = readFileSync(resolve(root, rel), "utf8");
  assert(
    `${rel}: no ProblemSolution import`,
    !src.includes("ProblemSolution")
  );
  assert(
    `${rel}: no DeliveryModels import`,
    !src.includes("DeliveryModels")
  );
}

// ---------------------------------------------------------------------------
// [4] Header nav: 4 page-route links in order (Services, Work, Pricing, About)
// ---------------------------------------------------------------------------
console.log("\n[4] site-header.tsx nav links");
const headerSrc = readFileSync(resolve(root, "components/site-header.tsx"), "utf8");
assert("header uses siteConfig.nav", headerSrc.includes("siteConfig.nav"));
assert("header logo href is /", headerSrc.includes('href="/"') || headerSrc.includes("href={`/`}"));
assert("header CTA points to /#contact", headerSrc.includes('href="/#contact"') || headerSrc.includes("href={`/#contact`}"));

// Check nav order via site.ts
const siteSrc = readFileSync(resolve(root, "lib/site.ts"), "utf8");
const servicesIdx = siteSrc.indexOf('"/services"');
const workIdx = siteSrc.indexOf('"/work"');
const pricingIdx = siteSrc.indexOf('"/pricing"');
const aboutIdx = siteSrc.indexOf('"/about"');
assert("nav has /services", servicesIdx !== -1);
assert("nav has /work", workIdx !== -1);
assert("nav has /pricing", pricingIdx !== -1);
assert("nav has /about", aboutIdx !== -1);
assert(
  "nav order: Services before Work",
  servicesIdx < workIdx,
  `services=${servicesIdx} work=${workIdx}`
);
assert(
  "nav order: Work before Pricing",
  workIdx < pricingIdx,
  `work=${workIdx} pricing=${pricingIdx}`
);
assert(
  "nav order: Pricing before About",
  pricingIdx < aboutIdx,
  `pricing=${pricingIdx} about=${aboutIdx}`
);

// No hash anchors for main nav items
assert(
  'nav does NOT have hash anchors for main items',
  !siteSrc.includes('"#services"') &&
    !siteSrc.includes('"#work"') &&
    !siteSrc.includes('"#pricing"') &&
    !siteSrc.includes('"#about"')
);

// ---------------------------------------------------------------------------
// [5] Sitemap lists all routes
// ---------------------------------------------------------------------------
console.log("\n[5] Sitemap lists all routes");
const sitemapSrc = readFileSync(resolve(root, "app/sitemap.ts"), "utf8");
for (const route of ["/services", "/pricing", "/about", "/work", "/privacy", "/terms"]) {
  assert(`sitemap includes ${route}`, sitemapSrc.includes(`"${route}"`) || sitemapSrc.includes(`\`\${siteConfig.url}${route}\``));
}
assert("sitemap includes root /", sitemapSrc.includes("siteConfig.url") && !sitemapSrc.match(/^\s*url:\s*["']\//m));

// ---------------------------------------------------------------------------
// [6] Each new route page has correct component imports
// ---------------------------------------------------------------------------
console.log("\n[6] Per-route component assignments");
const servicesSrc = readFileSync(resolve(root, "app/services/page.tsx"), "utf8");
const pricingSrc = readFileSync(resolve(root, "app/pricing/page.tsx"), "utf8");
const aboutSrc = readFileSync(resolve(root, "app/about/page.tsx"), "utf8");
const workSrc = readFileSync(resolve(root, "app/work/page.tsx"), "utf8");

assert("services page has SiteHeader", servicesSrc.includes("SiteHeader"));
assert("services page has SiteFooter", servicesSrc.includes("SiteFooter"));
assert("services page does NOT have ProblemSolution", !servicesSrc.includes("ProblemSolution"));
assert("services page does NOT have DeliveryModels", !servicesSrc.includes("DeliveryModels"));

assert("pricing page has Pricing component", pricingSrc.includes("Pricing"));
assert("pricing page has Faq", pricingSrc.includes("Faq"));

assert("about page has AboutFounder", aboutSrc.includes("AboutFounder"));

assert("work page has PastWork", workSrc.includes("PastWork"));
assert("work page has Reviews", workSrc.includes("Reviews"));

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
