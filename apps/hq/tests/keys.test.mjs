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

test("ownsKeys: typing targets own every key", () => {
  for (const key of ["j", "Enter", "Escape", "1"]) {
    for (const t of ["INPUT", "TEXTAREA", "SELECT"]) assert.ok(ownsKeys(el(t), key), `${t} ${key}`);
    assert.ok(ownsKeys(el("DIV", { isContentEditable: true }), key), `contentEditable ${key}`);
  }
});

test("ownsKeys: a link/button (or a child of one) owns Enter and Space only; j/k/Esc/1-4 still reach Board", () => {
  for (const s of ["a", "button", "[role=button]", "summary"]) {
    for (const key of ["Enter", " "])
      assert.ok(ownsKeys(el("SPAN", { within: [s] }), key), `${s} ${key}`);
    for (const key of ["j", "k", "Escape", "1", "4"])
      assert.equal(ownsKeys(el("SPAN", { within: [s] }), key), false, `${s} ${key}`);
  }
});

test("ownsKeys: body, rows and the detail pane own nothing; null does not", () => {
  for (const key of ["Enter", "j", " "]) {
    assert.equal(ownsKeys(el("BODY"), key), false);
    assert.equal(ownsKeys(el("DIV"), key), false);
    assert.equal(ownsKeys(null, key), false);
  }
});
