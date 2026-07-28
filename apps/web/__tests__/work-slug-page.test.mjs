// QA gate for `apps/web/app/work/[slug]/page.tsx` (PLAN item 3 — case study detail route).
// Live 200/404 status codes and the <1s render budget are proven by QA's live smoke pass
// against a real `next build && next start` server (see qa-report.md) — a committed unit
// test cannot safely own booting a production server, so this file gates everything that
// IS checkable from source + built HTML: static generation, no-hardcoded-copy, the
// CONTENT.md mirror, and per-item metadata. Every expected value is derived from
// siteContent at runtime — nothing here is a hand-maintained mirror of the registry.
// Run: node --experimental-strip-types --test __tests__/work-slug-page.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { siteContent } from "../lib/content.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const pageSrc = readFileSync(resolve(root, "app/work/[slug]/page.tsx"), "utf8");
const contentMd = readFileSync(resolve(root, "CONTENT.md"), "utf8");
const { items, caseStudy } = siteContent.pastWork;

function stripAndDecode(html) {
  let text = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
  // &amp; decoded LAST so an already-decoded &lt; etc. doesn't get double-unescaped.
  text = text
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  return text;
}

test("registry has at least one past-work item (guards against a vacuously-passing empty walk)", () => {
  assert.ok(items.length > 0, "siteContent.pastWork.items is empty — nothing for this route to prove");
});

// --- No hardcoded copy: the three section labels must be read from the registry ---
test("page.tsx sources the three section labels from siteContent.pastWork.caseStudy, not literals", () => {
  assert.ok(pageSrc.includes("caseStudy.problemLabel"), "page.tsx does not read caseStudy.problemLabel");
  assert.ok(pageSrc.includes("caseStudy.approachLabel"), "page.tsx does not read caseStudy.approachLabel");
  assert.ok(pageSrc.includes("caseStudy.outcomeLabel"), "page.tsx does not read caseStudy.outcomeLabel");
  for (const [key, label] of Object.entries(caseStudy)) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const hardcoded = new RegExp(`["'\`]${escaped}["'\`]`).test(pageSrc);
    assert.ok(!hardcoded, `page.tsx hardcodes caseStudy.${key} ("${label}") as a literal instead of reading it from the registry`);
  }
});

test("page.tsx calls notFound() when the slug lookup misses (no fallback shell, no fabricated copy)", () => {
  assert.ok(pageSrc.includes("notFound()"), "page.tsx never calls notFound()");
  assert.doesNotMatch(pageSrc, /coming soon|TBD|lorem ipsum/i, "page.tsx contains fallback/placeholder prose instead of notFound()");
});

// --- CONTENT.md mirrors the three case-study labels 1:1 (the real gate — no existing
// test file checked this; w4-content-mirror.test.mjs covers pricing/FAQ, not caseStudy) ---
for (const [key, value] of Object.entries(caseStudy)) {
  test(`CONTENT.md documents caseStudy.${key} = "${value}"`, () => {
    assert.ok(contentMd.includes(value), `CONTENT.md is missing caseStudy.${key} value "${value}"`);
  });
}

// --- generateStaticParams / build output: exactly one prerendered path per registry item ---
test("build prerenders exactly one static .html file per registry slug, no more no less", (t) => {
  const workDir = resolve(root, ".next/server/app/work");
  if (!existsSync(workDir)) {
    const msg = `SKIPPING: no build output at ${workDir} — run \`pnpm build\` first, or \`pnpm test\` from the repo root (Turbo builds first).`;
    console.error(`\n  ⚠️  ${msg}\n`);
    t.skip(msg);
    return;
  }
  const builtSlugs = readdirSync(workDir)
    .filter((f) => f.endsWith(".html"))
    .map((f) => f.replace(/\.html$/, ""))
    .sort();
  const registrySlugs = items.map((i) => i.slug).sort();
  assert.deepEqual(
    builtSlugs,
    registrySlugs,
    `built .html set ${JSON.stringify(builtSlugs)} != registry slugs ${JSON.stringify(registrySlugs)}`,
  );
});

// --- Per-item: built HTML renders that item's own problem/approach/outcome verbatim under the registry labels ---
for (const item of items) {
  test(`built /work/${item.slug} HTML renders its own problem/approach/outcome verbatim`, (t) => {
    const htmlPath = resolve(root, `.next/server/app/work/${item.slug}.html`);
    if (!existsSync(htmlPath)) {
      const msg = `SKIPPING: no build output at ${htmlPath} — run \`pnpm build\` first.`;
      console.error(`\n  ⚠️  ${msg}\n`);
      t.skip(msg);
      return;
    }
    const text = stripAndDecode(readFileSync(htmlPath, "utf8"));
    for (const field of ["problem", "approach", "outcome"]) {
      assert.ok(text.includes(item[field]), `/work/${item.slug} missing ${field}: "${item[field]}"`);
    }
    for (const label of Object.values(caseStudy)) {
      assert.ok(text.includes(label), `/work/${item.slug} missing section label "${label}"`);
    }
  });

  test(`built /work/${item.slug} <title> and meta description trace to its own registry fields`, (t) => {
    const htmlPath = resolve(root, `.next/server/app/work/${item.slug}.html`);
    if (!existsSync(htmlPath)) {
      t.skip(`no build output at ${htmlPath}`);
      return;
    }
    const html = readFileSync(htmlPath, "utf8");
    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    const descMatch = html.match(/<meta name="description" content="([^"]*)"/);
    assert.ok(titleMatch, `${item.slug}: no <title> found in built HTML`);
    assert.ok(
      titleMatch[1].includes(item.title),
      `${item.slug}: title "${titleMatch[1]}" doesn't include item.title "${item.title}"`,
    );
    assert.ok(descMatch, `${item.slug}: no meta description found in built HTML`);
    assert.ok(
      descMatch[1].includes(item.outcome),
      `${item.slug}: meta description doesn't include item.outcome`,
    );
  });
}

// --- generateMetadata actually reads params: the two items must NOT get the same title/description ---
test("the two case studies have different <title> and meta description", (t) => {
  const paths = items.map((i) => resolve(root, `.next/server/app/work/${i.slug}.html`));
  if (items.length < 2 || !paths.every(existsSync)) {
    t.skip("fewer than 2 registry items or build output missing");
    return;
  }
  const htmls = paths.map((p) => readFileSync(p, "utf8"));
  const titles = htmls.map((h) => h.match(/<title>([^<]*)<\/title>/)[1]);
  const descs = htmls.map((h) => h.match(/<meta name="description" content="([^"]*)"/)[1]);
  assert.notEqual(titles[0], titles[1], `both items rendered the same <title>: "${titles[0]}"`);
  assert.notEqual(descs[0], descs[1], "both items rendered the same meta description");
});

// --- Anti-fabrication guard at the route layer: rendered fields must still be [INPUT: ...] placeholders ---
const INPUT_RE = /^\[INPUT: .+\]$/;
test("every rendered narrative field is still an [INPUT: ...] placeholder (no fabricated prose slipped in)", () => {
  for (const item of items) {
    for (const field of ["problem", "approach", "outcome"]) {
      assert.match(
        item[field],
        INPUT_RE,
        `${item.slug}.${field} = "${item[field]}" is not an [INPUT: ...] placeholder`,
      );
    }
  }
});

// --- `screenshots` is a registry field the /work/[slug] page does not read (no
// component under apps/web/components or apps/web/app references it as of this
// pass) — so its presence or absence can never affect this route's output. The
// prior version of this test asserted that empty-array items still render,
// conditioned on such an item existing; with both registry items now non-empty
// that condition can never be true again, permanently skipping with zero
// coverage. Assert the real, always-executing invariant instead: this page's
// source doesn't branch on `screenshots` at all, so wiring it into the UI
// later is a page.tsx change, not a silent behavior change here. ---
test("page.tsx does not read item.screenshots (route output cannot depend on the field's contents)", () => {
  assert.ok(
    !pageSrc.includes("screenshots"),
    "page.tsx now references item.screenshots — the empty-array safety net needs re-adding (see git history for the removed test) since output can vary with the field's contents",
  );
});
