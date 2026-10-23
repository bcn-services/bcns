/**
 * home-layout.test.mjs — lib/home-layout.ts by behaviour: how a saved layout
 * merges onto the panels that exist, what Done persists, and the RPC calls.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLS,
  DEFAULT_ITEMS,
  PANEL_IDS,
  defaultLayout,
  layoutToSave,
  loadHomeLayout,
  mergeLayout,
  saveHomeLayout,
  toSaved,
} from "../lib/home-layout.ts";

const slot = (layout, id) => layout.find((l) => l.i === id);
const saved = (items) => ({ v: 1, items });

test("pinned literals: 12 columns, 13 panels, six individually-movable metric cards at w=2", () => {
  assert.equal(COLS, 12);
  assert.equal(PANEL_IDS.length, 13);
  assert.deepEqual(PANEL_IDS.slice(0, 6), ["m-revenue", "m-orders", "m-conversion", "m-roas", "m-aov", "m-inventory"]);
  assert.ok(DEFAULT_ITEMS.slice(0, 6).every((d, n) => d.w === 2 && d.x === n * 2 && d.y === 0));
  assert.ok(DEFAULT_ITEMS.every((d) => d.x + d.w <= 12));
});

test("null / garbage / wrong version / no items all give the default layout", () => {
  for (const bad of [null, undefined, "x", 5, [], {}, { v: 2, items: [] }, { v: 1 }, { v: 1, items: "no" }, { v: 1, items: [] }]) {
    assert.deepEqual(mergeLayout(bad), defaultLayout(), JSON.stringify(bad));
  }
});

test("a saved slot is used; unsaved panels get their default slot", () => {
  const out = mergeLayout(saved([{ i: "meta", x: 0, y: 0, w: 6, h: 10 }]));
  assert.deepEqual({ ...slot(out, "meta") }, { ...slot(defaultLayout(), "meta"), x: 0, y: 0, w: 6, h: 10 });
  assert.equal(out.length, 13);
  assert.deepEqual(slot(out, "m-revenue").w, 2);
});

test("a saved id with no panel is ignored (stale), both unknown ids and ids the page no longer renders", () => {
  const items = [
    { i: "daily-report", x: 0, y: 0, w: 12, h: 8 },
    { i: "shopify", x: 0, y: 0, w: 4, h: 9 },
    { i: "meet", x: 4, y: 0, w: 3, h: 12 },
  ];
  const out = mergeLayout(saved(items));
  assert.equal(slot(out, "daily-report"), undefined);
  assert.deepEqual(out.map((l) => l.i).sort(), [...PANEL_IDS].sort());

  const without = mergeLayout(saved(items), PANEL_IDS.filter((id) => id !== "meet"));
  assert.equal(slot(without, "meet"), undefined);
  assert.equal(without.length, 12);
});

test("a panel missing from the save lands in its default columns, below what it would overlap", () => {
  // Everything but Activity saved in a short stack; Activity (cols 9-11) must not overlap Library there.
  const items = defaultLayout().filter((d) => d.i !== "activity").map((d) => ({ ...d, y: 0, h: 5 }));
  const out = mergeLayout(saved(items));
  const act = slot(out, "activity");
  assert.equal(act.x, 9);
  assert.equal(act.w, 3);
  assert.equal(act.h, 12);
  const overlapping = out.filter((l) => l.i !== "activity" && l.x < 12 && act.x < l.x + l.w && l.x < act.x + act.w);
  assert.ok(act.y >= Math.max(...overlapping.map((l) => l.y + l.h)));
});

test("shape validation: non-integers, negatives and missing fields drop the item (it falls back to its default slot)", () => {
  const bad = [
    { i: "shopify", x: 1.5, y: 0, w: 4, h: 9 },
    { i: "meta", x: "4", y: 0, w: 4, h: 9 },
    { i: "finance", x: 8, y: 0, w: 4 },
    null,
    "finance",
    { x: 0, y: 0, w: 4, h: 4 },
    { i: "meet", x: 0, y: 0, w: 3, h: 12 },
  ];
  const out = mergeLayout(saved(bad));
  assert.equal(slot(out, "meet").y, 0);
  assert.equal(slot(out, "shopify").x, 0); // default slot, not the 1.5
  assert.equal(slot(out, "meta").x, 4);
  assert.equal(slot(out, "finance").x, 8);
});

test("clamped to the 12-column grid and each panel's minimum / the height ceiling", () => {
  const out = mergeLayout(saved([
    { i: "shopify", x: 10, y: -3, w: 99, h: 1 },
    { i: "meta", x: 11, y: 4, w: 4, h: 500 },
    { i: "m-revenue", x: -5, y: 0, w: 1, h: 1 },
  ]));
  const shopify = slot(out, "shopify");
  assert.deepEqual([shopify.x, shopify.y, shopify.w, shopify.h], [0, 0, 12, 5]);
  const meta = slot(out, "meta");
  assert.deepEqual([meta.x, meta.w, meta.h], [8, 4, 60]);
  const rev = slot(out, "m-revenue");
  assert.deepEqual([rev.x, rev.w, rev.h], [0, 2, 3]);
  assert.ok(out.every((l) => l.x >= 0 && l.x + l.w <= 12));
});

test("a duplicated id keeps the first entry", () => {
  const out = mergeLayout(saved([
    { i: "meta", x: 0, y: 0, w: 4, h: 9 },
    { i: "meta", x: 8, y: 0, w: 4, h: 9 },
  ]));
  assert.equal(out.filter((l) => l.i === "meta").length, 1);
  assert.equal(slot(out, "meta").x, 0);
});

test("toSaved strips everything but id and position", () => {
  const out = toSaved(defaultLayout());
  assert.equal(out.v, 1);
  assert.deepEqual(Object.keys(out.items[0]).sort(), ["h", "i", "w", "x", "y"]);
});

test("layoutToSave: the default (even re-ordered or with extra hints) saves as null; a change saves the shape", () => {
  assert.equal(layoutToSave(defaultLayout()), null);
  assert.equal(layoutToSave([...defaultLayout()].reverse()), null);
  const moved = defaultLayout().map((d) => (d.i === "meta" ? { ...d, x: 0, y: 20 } : d));
  const out = layoutToSave(moved);
  assert.equal(out.v, 1);
  assert.deepEqual(slot(out.items, "meta"), { i: "meta", x: 0, y: 20, w: 4, h: 9 });
});

function fakeClient({ row, rowError, rpcThrows } = {}) {
  const calls = [];
  return {
    calls,
    views: { client_v1: (cols) => ({ single: async () => { calls.push(["client_v1", cols]); return { data: row ?? null, error: rowError ?? null }; } }) },
    rpc: { set_home_layout: async (args) => { calls.push(["set_home_layout", args]); if (rpcThrows) throw new Error("boom"); } },
  };
}

test("loadHomeLayout: reads client_v1.home_layout; null on no row, a read error, or a throw", async () => {
  const layout = saved([{ i: "meta", x: 0, y: 0, w: 4, h: 9 }]);
  const ok = fakeClient({ row: { home_layout: layout } });
  assert.deepEqual(await loadHomeLayout(ok), layout);
  assert.deepEqual(ok.calls, [["client_v1", "home_layout"]]);
  assert.equal(await loadHomeLayout(fakeClient({ row: { home_layout: null } })), null);
  assert.equal(await loadHomeLayout(fakeClient({ rowError: { message: "column missing" } })), null);
  const throwing = { views: { client_v1: () => ({ single: async () => { throw new Error("net"); } }) } };
  assert.equal(await loadHomeLayout(throwing), null);
});

test("saveHomeLayout: a changed layout goes to api.set_home_layout as the sanitized shape", async () => {
  const c = fakeClient();
  const input = saved([
    { i: "meta", x: 0, y: 20, w: 4, h: 9, minW: 3, evil: "x" },
    { i: "gone-panel", x: 0, y: 0, w: 4, h: 4 },
  ]);
  assert.equal(await saveHomeLayout(c, input), true);
  assert.equal(c.calls.length, 1);
  assert.equal(c.calls[0][0], "set_home_layout");
  const sent = c.calls[0][1].p_layout;
  assert.equal(sent.v, 1);
  assert.equal(sent.items.length, 13);
  assert.equal(sent.items.some((l) => l.i === "gone-panel"), false);
  assert.deepEqual(sent.items.find((l) => l.i === "meta"), { i: "meta", x: 0, y: 20, w: 4, h: 9 });
});

test("saveHomeLayout: null resets with p_layout null; the default also saves as null", async () => {
  const a = fakeClient();
  assert.equal(await saveHomeLayout(a, null), true);
  assert.deepEqual(a.calls, [["set_home_layout", { p_layout: null }]]);
  const b = fakeClient();
  assert.equal(await saveHomeLayout(b, toSaved(defaultLayout())), true);
  assert.deepEqual(b.calls, [["set_home_layout", { p_layout: null }]]);
});

test("saveHomeLayout: no client, an unreadable layout, or an RPC failure saves nothing and returns false", async () => {
  assert.equal(await saveHomeLayout(null, null), false);
  const c = fakeClient();
  for (const bad of [undefined, "x", 5, {}, { v: 2, items: [] }, { v: 1, items: "no" }]) assert.equal(await saveHomeLayout(c, bad), false);
  assert.deepEqual(c.calls, []); // a garbage payload must not quietly reset the layout
  assert.equal(await saveHomeLayout(fakeClient({ rpcThrows: true }), null), false);
});
