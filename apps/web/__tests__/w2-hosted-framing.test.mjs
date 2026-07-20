/**
 * W2 QA gate: honest hosted framing in content.ts.
 * Run with: node --experimental-strip-types --test __tests__/w2-hosted-framing.test.mjs
 *
 * Criteria (registry-level):
 * 1. "Use it forever, free" gone; hero proof point communicates bcns hosts/runs it.
 * 2. "whether we work together or not" gone (count 0).
 * 3. No claim that client owns the code / software runs independently of bcns.
 * 4. Contact highlight communicates data is the client's and exportable.
 * 5. content.ts stays em-dash-free and buzzword-free (no "SaaS", no "we help").
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { siteContent } from "../lib/content.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const contentSrc = readFileSync(resolve(root, "lib/content.ts"), "utf8");

// --- 1. Old "free forever" claim gone; hero proof point now says bcns hosts/runs it ---
test("hero proofPoints no longer say 'Use it forever, free'", () => {
  assert.equal(contentSrc.includes("Use it forever, free"), false);
  assert.equal(
    siteContent.hero.proofPoints.some((p) => p === "Use it forever, free"),
    false
  );
});

test("hero proofPoints communicate bcns hosts/runs it", () => {
  const joined = siteContent.hero.proofPoints.join(" ").toLowerCase();
  assert.ok(
    /\bhost\b|\bhosts\b|\bhost it\b|running/.test(joined),
    `expected a hosting/running proof point, got: ${JSON.stringify(siteContent.hero.proofPoints)}`
  );
});

// --- 2. "whether we work together or not" gone ---
test("'whether we work together or not' appears zero times", () => {
  const count = contentSrc.split("whether we work together or not").length - 1;
  assert.equal(count, 0);
});

// --- 3. No independent-run / client-owns-code claims ---
test("no claim that software runs without bcns or client owns the code", () => {
  const removed = [
    "Use it forever, free",
    "whether we work together or not",
    "It keeps running whether",
    "keeps running whether we work together",
    "yours to keep",
    "you own the code",
    "own the code",
  ];
  for (const phrase of removed) {
    assert.equal(
      contentSrc.includes(phrase),
      false,
      `removed phrase still present: "${phrase}"`
    );
  }
});

// --- 4. Contact highlight: data is the client's and exportable ---
test("a contact highlight states data is the client's and exportable", () => {
  const match = siteContent.contactSection.highlights.find((h) => {
    const text = `${h.title} ${h.description}`.toLowerCase();
    const ownership = /your data|data is (always )?yours|data.*yours/.test(text);
    const exportable = /export/.test(text);
    return ownership && exportable;
  });
  assert.ok(
    match,
    `no highlight communicates data-ownership + export; got: ${JSON.stringify(
      siteContent.contactSection.highlights
    )}`
  );
});

// --- 5. content.ts em-dash-free and buzzword-free ---
test("content.ts contains no em-dash", () => {
  assert.equal(contentSrc.includes("—"), false);
});

test("content.ts contains no 'SaaS'", () => {
  assert.equal(contentSrc.includes("SaaS"), false);
});

test("content.ts contains no 'we help'", () => {
  assert.equal(contentSrc.toLowerCase().includes("we help"), false);
});

// --- extra: howItWorks step no longer implies one-time handoff-and-gone ---
test("howItWorks build step reframed toward hosting/maintaining", () => {
  const step = siteContent.howItWorks.items[2];
  const text = `${step.title} ${step.description}`.toLowerCase();
  assert.ok(
    /host|maintain|keep it running|keeps working/.test(text),
    `expected hosted framing in build step, got: ${JSON.stringify(step)}`
  );
});
