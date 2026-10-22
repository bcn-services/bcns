import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guideFilter } from "../lib/source-guides.ts";

test("guideFilter: a known source narrows to it; missing, unknown or repeated is all (null)", () => {
  assert.equal(guideFilter("shopify"), "shopify");
  assert.equal(guideFilter("quickbooks"), "quickbooks");
  assert.equal(guideFilter(undefined), null);
  assert.equal(guideFilter(""), null);
  assert.equal(guideFilter("nope"), null);
  assert.equal(guideFilter("Shopify"), null);
  assert.equal(guideFilter(["shopify", "meta"]), null);
});
test("/guide page: gated like its siblings, chips for All + every source, one shared SourceGuide per shown source", () => {
  const src = readFileSync(new URL("../app/guide/page.tsx", import.meta.url), "utf8");
  assert.match(src, /await requireHub\(\)/);
  assert.match(src, /guideFilter\(searchParams\.source\)/);
  assert.match(src, /className="kchips"/);
  assert.match(src, /href=\{`\/guide\?source=\$\{source\}`\}/);
  assert.match(src, /<SourceGuide key=\{source\} source=\{source\} anchor=\{`how-\$\{source\}`\} footer=\{false\} \/>/);
  // The shared footer shows once at the bottom, not once per panel.
  assert.match(src, /<p className="note">\{GUIDE_FOOTER\}<\/p>/);
  // Six panels on one page need six ids.
  assert.doesNotMatch(src, /id="how"/);
});
test("middleware matcher still runs on /guide (signed-out gets sent to login)", () => {
  const mw = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  const m = mw.match(/matcher:\s*\["([^"]+)"\]/);
  assert.ok(m, "matcher literal not found");
  // Next anchors the matcher as a full-path regex.
  const re = new RegExp(`^${m[1]}$`);
  assert.ok(re.test("/guide"));
  assert.ok(!re.test("/api/health"), "sanity: the matcher does exclude public routes");
});
test("card CSS: errors and every control kind sit above the stretched link; rows view keeps the Shopify link", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.grid-src \.sc-f > :is\(form, details, a, button\), \.grid-src \.sc \.err \{ position: relative; z-index: 1; \}/);
  assert.match(css, /\.srct \.sc-f:not\(:has\(form, details, p, a\)\) \{ display: none; \}/);
  assert.match(css, /\.sc-f \{[^}]*flex-wrap: wrap;/);
});
