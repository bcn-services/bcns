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

// &amp; decoded LAST so an already-decoded &lt; etc. doesn't get double-unescaped.
function decodeEntities(text) {
  return text
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripAndDecode(html) {
  const text = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
  return decodeEntities(text);
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
      decodeEntities(titleMatch[1]).includes(item.title),
      `${item.slug}: title "${titleMatch[1]}" doesn't include item.title "${item.title}"`,
    );
    assert.ok(descMatch, `${item.slug}: no meta description found in built HTML`);
    assert.ok(
      decodeEntities(descMatch[1]).includes(item.outcome),
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

// --- Route layer: rendered narrative fields must be real copy, not placeholders ---
// Inverted from the original guard, which required [INPUT: ...] placeholders to keep
// an agent from inventing prose about a real client. The fields are now filled from
// detail Nate confirmed, so the useful check is that no placeholder comes back.
const INPUT_RE = /\[(INPUT|SLOT):/;
test("every rendered narrative field is real copy (no placeholder regression)", () => {
  for (const item of items) {
    for (const field of ["problem", "approach", "outcome"]) {
      assert.doesNotMatch(
        item[field],
        INPUT_RE,
        `${item.slug}.${field} regressed to a placeholder: "${item[field]}"`,
      );
      assert.ok(
        item[field].trim().length > 0,
        `${item.slug}.${field} is empty`,
      );
    }
  }
});

// --- PLAN item 8 wired `screenshots` into the page (next/image rendering). The prior
// "page.tsx does not read screenshots" invariant is now obsolete by design — its own
// failure message pointed here. Re-add the empty-array safety net it warned about:
// both live registry items have non-empty screenshots arrays (see team-memory), so a
// built-HTML check can't exercise the empty case without mutating the registry.
// Assert the source-level guard instead, consistent with this file's other
// pageSrc.includes(...) checks for behavior the two live items can't exercise. ---
test("page.tsx guards the screenshots block on item.screenshots.length > 0 (no empty wrapper for an item with no screenshots)", () => {
  assert.ok(
    pageSrc.includes("item.screenshots.length > 0"),
    "page.tsx renders the screenshots wrapper unconditionally — an item with an empty screenshots array would still render an empty spacer",
  );
});

// --- Screenshots that DO exist must actually render: image alt text + caption.
// `alt` is an <img> attribute, not text content, so it must be checked against the
// entity-decoded raw HTML — stripAndDecode's tag-stripping would erase it along with
// the tag it lives on. `caption` renders as <figcaption> text, so stripAndDecode is
// the right check for it. ---
test("built HTML renders every registry screenshot's alt text and caption", (t) => {
  const paths = items.map((i) => resolve(root, `.next/server/app/work/${i.slug}.html`));
  if (!paths.every(existsSync)) {
    t.skip("build output missing");
    return;
  }
  for (const item of items) {
    const raw = readFileSync(resolve(root, `.next/server/app/work/${item.slug}.html`), "utf8");
    const decodedRaw = decodeEntities(raw);
    const text = stripAndDecode(raw);
    for (const shot of item.screenshots) {
      assert.ok(
        decodedRaw.includes(`alt="${shot.alt}"`),
        `${item.slug}: built HTML is missing alt="${shot.alt}" for ${shot.src}`,
      );
      assert.ok(text.includes(shot.caption), `${item.slug}: built HTML is missing caption for ${shot.src}`);
    }
  }
});

// --- CASE_STUDY_IMAGES (lib/case-study-images.ts) is a hand-synced mirror of every
// registry screenshots[].src. The build only catches registry->map drift (an
// unregistered src throws during prerender); it catches NOTHING in the other
// direction — an orphan map entry with no registry reference builds fine. Since this
// suite runs under `node --experimental-strip-types` and can't import a module that
// statically imports .png files, read the map file as source text and regex its
// quoted "/case-studies/..." keys instead. ---
test("CASE_STUDY_IMAGES (lib/case-study-images.ts) exactly mirrors the registry's screenshot srcs, in both directions", () => {
  const registrySrcs = new Set(items.flatMap((item) => item.screenshots).map((shot) => shot.src));
  const mapFileSrc = readFileSync(resolve(root, "lib/case-study-images.ts"), "utf8");
  const mapSrcs = new Set(
    [...mapFileSrc.matchAll(/["'](\/case-studies\/[^"']+)["']\s*:/g)].map((m) => m[1]),
  );
  assert.ok(registrySrcs.size > 0, "registry screenshots[].src set is empty — comparison would pass vacuously");
  assert.ok(mapSrcs.size > 0, "CASE_STUDY_IMAGES key set is empty — comparison would pass vacuously");
  assert.deepEqual(
    [...mapSrcs].sort(),
    [...registrySrcs].sort(),
    `CASE_STUDY_IMAGES keys ${JSON.stringify([...mapSrcs].sort())} != registry srcs ${JSON.stringify([...registrySrcs].sort())}`,
  );
});
