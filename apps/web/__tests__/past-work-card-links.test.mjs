// QA gate for making each Past Work card a link to its detail page (PLAN item 4).
// This is a REAL markup assertion, not a source grep for "<a>" — next/link renders
// its own anchor and the optional external `link` field renders a second one, so the
// only trustworthy check is walking the actual built HTML in document order.
// Run: node --experimental-strip-types --test __tests__/past-work-card-links.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { siteContent } from "../lib/content.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const buildDir = resolve(root, ".next/server/app");
const pageSrc = readFileSync(resolve(root, "components/past-work.tsx"), "utf8");
const { items } = siteContent.pastWork;

function skipNoBuild(t, path) {
  const msg = `SKIPPING: no build output at ${path} — run \`pnpm build\` first, or \`pnpm test\` from the repo root (Turbo builds first).`;
  console.error(`\n  ⚠️  ${msg}\n`);
  t.skip(msg);
}

// Recursively collects every *.html under `dir`. Excludes any `.claude/` segment —
// nested dev-team worktrees are full checkouts of this same repo, so a walk that
// isn't scoped would double-count (or diverge) across the main checkout vs a worktree.
function collectHtmlFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".claude") continue;
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectHtmlFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      results.push(full);
    }
  }
  return results;
}

// Walks `<a ...>` / `</a>` tokens in document order and tracks nesting depth.
// Depth exceeding 1 means an anchor is rendered inside another anchor (invalid HTML,
// and the exact bug this test exists to catch: next/link's anchor wrapping the
// external `link` anchor instead of sitting beside it).
function findNestedAnchors(html) {
  const stripped = html.replace(/<script[\s\S]*?<\/script>/g, "");
  const tokenRe = /<a\b[^>]*>|<\/a>/gi;
  let depth = 0;
  let anchorCount = 0;
  const violations = [];
  let match;
  while ((match = tokenRe.exec(stripped)) !== null) {
    if (match[0].toLowerCase() === "</a>") {
      depth = Math.max(0, depth - 1);
    } else {
      depth++;
      anchorCount++;
      if (depth > 1) {
        violations.push(stripped.slice(Math.max(0, match.index - 40), match.index + 80));
      }
    }
  }
  return { anchorCount, violations };
}

test("registry has at least one past-work item (guards against a vacuously-passing empty walk)", () => {
  assert.ok(items.length > 0, "siteContent.pastWork.items is empty — nothing for this test to prove");
});

test("the card <Link> in past-work.tsx carries a focus-visible:ring- treatment", () => {
  // Match any interpolation inside the template literal (`${slug}`, `${item.slug}`, …)
  // rather than one variable name, so renaming the loop binding cannot fail an
  // assertion that is really about the focus treatment.
  const linkMatch = pageSrc.match(
    /<Link\s+href=\{`\/work\/\$\{[^}]+\}`\}\s+className="([^"]*)"/,
  );
  assert.ok(linkMatch, "could not find the card <Link href={`/work/${slug}`}> in past-work.tsx");
  assert.match(
    linkMatch[1],
    /focus-visible:ring-/,
    `card Link className does not carry a focus-visible:ring- treatment: "${linkMatch[1]}"`,
  );
});

test("no <a> is nested inside another <a>, across every built page under .next/server/app", (t) => {
  if (!existsSync(buildDir)) return skipNoBuild(t, buildDir);

  const htmlFiles = collectHtmlFiles(buildDir);
  assert.ok(htmlFiles.length > 0, `no .html files found under ${buildDir}`);

  let totalAnchors = 0;
  const failures = [];
  for (const file of htmlFiles) {
    const { anchorCount, violations } = findNestedAnchors(readFileSync(file, "utf8"));
    totalAnchors += anchorCount;
    if (violations.length > 0) {
      failures.push(`${file}: ${violations.length} nested-anchor violation(s), e.g. "${violations[0]}"`);
    }
  }

  assert.ok(totalAnchors > 0, "zero <a> anchors found across all built pages — scan is vacuous");
  assert.deepEqual(failures, [], `nested <a> found:\n${failures.join("\n")}`);
});

test("built /work page has at least items.length + 1 anchors (guards against a vacuously-passing empty scan)", (t) => {
  const workHtmlPath = resolve(buildDir, "work.html");
  if (!existsSync(workHtmlPath)) return skipNoBuild(t, workHtmlPath);

  const { anchorCount } = findNestedAnchors(readFileSync(workHtmlPath, "utf8"));
  assert.ok(anchorCount > 0, "zero <a> anchors found in built /work page");
  assert.ok(
    anchorCount >= items.length + 1,
    `expected at least ${items.length + 1} anchors (registry items + 1) in built /work page, found ${anchorCount}`,
  );
});

test('every registry slug appears as href="/work/<slug>" in the built /work page', (t) => {
  const workHtmlPath = resolve(buildDir, "work.html");
  if (!existsSync(workHtmlPath)) return skipNoBuild(t, workHtmlPath);

  const html = readFileSync(workHtmlPath, "utf8");
  for (const item of items) {
    assert.ok(
      html.includes(`href="/work/${item.slug}"`),
      `built /work page is missing an anchor with href="/work/${item.slug}"`,
    );
  }
});
