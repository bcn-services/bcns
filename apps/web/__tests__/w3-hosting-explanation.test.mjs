/**
 * W3 QA gate: "how hosting works" explanation delivered via faq.items[4..6].
 * Run with: node --experimental-strip-types --test __tests__/w3-hosting-explanation.test.mjs
 *
 * Criteria:
 * 1. Rendered /pricing (built HTML) explains what the monthly fee includes:
 *    at least hosting, backups, and bug fixes. (/pricing renders <Faq/>.)
 * 2. A FAQ entry explains bring-your-own-Anthropic-key + AI is optional/omittable.
 * 3. A FAQ entry states plainly what happens if they stop paying:
 *    hosting stops AND data is exported/handed over.
 * 4. New copy is em-dash-free and buzzword-free (no SaaS / "we help").
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { siteContent } from "../lib/content.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const contentSrc = readFileSync(resolve(root, "lib/content.ts"), "utf8");
const items = siteContent.faq.items;

// Helper: find a faq item whose combined question+answer (lowercased) matches all predicates.
function findItem(...predicates) {
  return items.find((it) => {
    const text = `${it.question} ${it.answer}`.toLowerCase();
    return predicates.every((p) => p.test(text));
  });
}

// --- Criterion 1 (registry): monthly-fee coverage lists hosting, backups, bug fixes ---
test("a FAQ entry explains the monthly fee covers hosting, backups, and bug fixes", () => {
  const item = findItem(/monthly fee/, /host/, /backup/, /bug fix/);
  assert.ok(
    item,
    `no faq item covers monthly-fee → hosting+backups+bug fixes; got questions: ${JSON.stringify(
      items.map((i) => i.question)
    )}`
  );
});

// --- Criterion 1 (behavioral): built /pricing HTML contains the same coverage ---
test("built /pricing HTML explains monthly fee includes hosting, backups, bug fixes", () => {
  const htmlPath = resolve(root, ".next/server/app/pricing.html");
  assert.ok(
    existsSync(htmlPath),
    `built pricing HTML not found at ${htmlPath} — run \`corepack pnpm build\` first`
  );
  const html = readFileSync(htmlPath, "utf8").toLowerCase();
  for (const term of ["hosting", "backup", "bug fix"]) {
    assert.ok(
      html.includes(term),
      `rendered /pricing HTML missing monthly-fee term: "${term}"`
    );
  }
});

// --- Criterion 2: bring-your-own-Anthropic-key + AI optional ---
test("a FAQ entry explains bring-your-own-Anthropic-key and that AI is optional", () => {
  const item = findItem(/anthropic/, /\bkey\b/, /optional|leave ai out|without|omit/);
  assert.ok(
    item,
    `no faq item covers BYO Anthropic key + AI optional; got questions: ${JSON.stringify(
      items.map((i) => i.question)
    )}`
  );
  const text = `${item.question} ${item.answer}`.toLowerCase();
  assert.ok(
    /bills? you|billed|bills directly|bill you directly/.test(text),
    `BYO-key item should state Anthropic bills the client; got: ${item.answer}`
  );
});

// --- Criterion 3: stop-paying → hosting stops AND data exported/handed over ---
test("a FAQ entry states stop-paying means hosting stops and data is exported", () => {
  const item = findItem(
    /stop paying|stop the monthly|cancel/,
    /hosting stops|goes offline|offline|stops/,
    /export|hand (it |them )?over|handed over/
  );
  assert.ok(
    item,
    `no faq item states stop-paying → hosting stops + data exported; got questions: ${JSON.stringify(
      items.map((i) => i.question)
    )}`
  );
});

// --- Criterion 4: new copy em-dash-free and buzzword-free ---
test("new faq items are em-dash-free", () => {
  const newItems = items.slice(4);
  for (const it of newItems) {
    const blob = `${it.question} ${it.answer}`;
    assert.equal(blob.includes("—"), false, `em-dash in: ${blob}`);
  }
});

test("new faq items contain no 'SaaS' and no 'we help'", () => {
  const newItems = items.slice(4);
  for (const it of newItems) {
    const blob = `${it.question} ${it.answer}`.toLowerCase();
    assert.equal(blob.includes("saas"), false, `'SaaS' in: ${it.question}`);
    assert.equal(blob.includes("we help"), false, `'we help' in: ${it.question}`);
  }
});

// --- Guard: the three W3 items were appended, not replacing 0..3 ---
test("faq.items[0] question is unchanged (W3 appended, did not renumber)", () => {
  assert.equal(items[0].question, "How much will my project cost?");
  assert.ok(items.length >= 7, `expected >=7 faq items after W3, got ${items.length}`);
  // Sanity: content.ts source itself stays em-dash-free overall.
  assert.equal(contentSrc.includes("—"), false, "content.ts contains an em-dash");
});
