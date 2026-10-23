/**
 * popup-dismiss.test.mjs — every popup in apps/sb closes on an outside click
 * and on Escape through one shared mechanism (lib/popup-dismiss.ts, mounted once
 * by app/_components/PopupDismiss.tsx from app/layout.tsx).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { popupsToClose, OPEN_POPUPS } from "../lib/popup-dismiss.ts";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

/** A fake <details>: open, and "contains" a set of fake targets. */
const popup = (name, inside = []) => ({ name, open: true, contains: (t) => inside.includes(t) });

test("a click outside closes every open popup", () => {
  const a = popup("a", ["a-summary"]);
  const b = popup("b", ["b-summary"]);
  assert.deepEqual(popupsToClose([a, b], { type: "click", target: "page-body" }).map((p) => p.name), ["a", "b"]);
});

test("a click inside a popup (its summary or panel) leaves it open and closes the others", () => {
  const a = popup("a", ["a-summary", "a-panel"]);
  const b = popup("b", ["b-summary"]);
  assert.deepEqual(popupsToClose([a, b], { type: "click", target: "a-panel" }).map((p) => p.name), ["b"]);
  assert.deepEqual(popupsToClose([a, b], { type: "click", target: "b-summary" }).map((p) => p.name), ["a"]);
});

test("Escape closes all open popups; other keys and events close none", () => {
  const open = [popup("a"), popup("b")];
  assert.equal(popupsToClose(open, { type: "keydown", key: "Escape", target: "x" }).length, 2);
  assert.equal(popupsToClose(open, { type: "keydown", key: "Enter", target: "x" }).length, 0);
  assert.equal(popupsToClose(open, { type: "scroll", target: "x" }).length, 0);
  assert.equal(popupsToClose([], { type: "click", target: "x" }).length, 0);
});

function tsxFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith(".tsx") ? [path] : [];
  });
}

test("every <details> element under app/ is a popup (className starts with \"popup\"), so the shared selector reaches it", () => {
  assert.equal(OPEN_POPUPS, "details.popup[open]");
  const appDir = new URL("../app", import.meta.url).pathname;
  let found = 0;
  for (const file of tsxFiles(appDir)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/<details\b([^>]*)>/g)) {
      found++;
      assert.match(m[1], /className="popup[ "]/, `${file}: <details${m[1]}> is not wired to the shared popup dismissal`);
    }
  }
  assert.ok(found >= 6, `expected the header, library and transactions popups, found ${found}`);
});

test("the dismissal is mounted once, in the root layout, and listens for click and keydown", () => {
  const layout = read("../app/layout.tsx");
  assert.match(layout, /import \{ PopupDismiss \} from "@\/app\/_components\/PopupDismiss";/);
  assert.match(layout, /<PopupDismiss \/>/);
  const comp = read("../app/_components/PopupDismiss.tsx");
  assert.match(comp, /^"use client";/);
  assert.match(comp, /addEventListener\("click"/);
  assert.match(comp, /addEventListener\("keydown"/);
  assert.match(comp, /removeEventListener\("click"/);
  assert.match(comp, /popupsToClose\(/);
});
