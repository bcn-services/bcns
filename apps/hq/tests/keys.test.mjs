/** keys.test.mjs — Board's shortcuts must not hijack typing or a focused link/button (Enter would never activate it). */

import { test } from "node:test";
import assert from "node:assert/strict";

const { ownsKeys } = await import("../lib/keys.ts");

// Minimal fake of the HTMLElement bits ownsKeys reads; `closest` matches when any selector in the list is in `within`.
const el = (tagName, { within = [], isContentEditable = false } = {}) => ({
  tagName,
  isContentEditable,
  closest: (sel) => (sel.split(",").some((s) => within.includes(s)) ? {} : null),
});

test("ownsKeys: inputs, contentEditable, links, buttons (and their children), summaries own their keys", () => {
  for (const t of ["INPUT", "TEXTAREA", "SELECT"]) assert.ok(ownsKeys(el(t)), t);
  assert.ok(ownsKeys(el("DIV", { isContentEditable: true })));
  for (const s of ["a", "button", "[role=button]", "summary"]) assert.ok(ownsKeys(el("SPAN", { within: [s] })), s);
});

test("ownsKeys: body, rows and the detail pane do not; null does not", () => {
  assert.equal(ownsKeys(el("BODY")), false);
  assert.equal(ownsKeys(el("DIV")), false);
  assert.equal(ownsKeys(null), false);
});
