// Case-study screenshot gate: every pastWork.items[].screenshots[].src must resolve
// to a real PNG committed under public/case-studies/, and that directory must hold
// nothing the registry doesn't reference (and vice versa). All assertions walk
// siteContent at runtime — no hand-listed filenames, so this can't drift silently
// the way the CONTENT.md field count once did.
// Run: node --experimental-strip-types --test __tests__/case-study-screenshots.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { siteContent } from "../lib/content.ts";
import { existsSync, readdirSync, statSync } from "fs";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const caseStudiesDir = resolve(__dirname, "..", "public", "case-studies");

// Walk the registry for every screenshot entry across every past-work item.
const screenshots = siteContent.pastWork.items.flatMap((item) => item.screenshots);

test("pastWork registry has at least one screenshot (walk isn't vacuous)", () => {
  assert.ok(screenshots.length > 0, "expected screenshots[] entries somewhere in pastWork.items");
});

test("public/case-studies directory exists", () => {
  assert.ok(existsSync(caseStudiesDir), `${caseStudiesDir} does not exist`);
});

test("every screenshots[].src resolves to a real file on disk", () => {
  for (const shot of screenshots) {
    assert.match(shot.src, /^\/case-studies\/[^/]+\.png$/, `src "${shot.src}" is not a /case-studies/*.png path`);
    const filePath = resolve(caseStudiesDir, basename(shot.src));
    assert.ok(existsSync(filePath), `registry src "${shot.src}" has no file at ${filePath}`);
    assert.ok(statSync(filePath).isFile(), `${filePath} is not a regular file`);
  }
});

test("public/case-studies contains exactly the files the registry references (no orphans)", () => {
  const onDisk = existsSync(caseStudiesDir)
    ? readdirSync(caseStudiesDir).filter((f) => f.endsWith(".png"))
    : [];
  const referenced = screenshots.map((s) => basename(s.src));
  assert.deepEqual(
    [...onDisk].sort(),
    [...new Set(referenced)].sort(),
    "public/case-studies/ file set and registry-referenced screenshot set must match exactly",
  );
});

test("public/case-studies contains exactly three PNGs", () => {
  const onDisk = readdirSync(caseStudiesDir);
  assert.equal(onDisk.length, 3, `expected exactly 3 files, found: ${onDisk.join(", ")}`);
  for (const f of onDisk) {
    assert.match(f, /\.png$/, `${f} is not a .png file`);
  }
});
