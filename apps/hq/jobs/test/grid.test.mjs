import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GRID,
  TRADES,
  TOWNS,
  pickNextCell,
  evaluateRun,
  cellQuery,
  isKnownCell,
} from "../lib/grid.mjs";

const cells = (rows) => rows.map((r) => ({ exhausted_at: null, last_run_at: null, ...r }));

test("the grid is every trade by every town, and nothing else", () => {
  assert.equal(TRADES.length, 33);
  assert.equal(TOWNS.length, 79);
  assert.equal(GRID.length, 2607);
  assert.equal(GRID.length, TRADES.length * TOWNS.length);
  assert.ok(isKnownCell({ trade: "accountants", town: "Milford", state: "CT" }));
  assert.ok(isKnownCell({ trade: "law firms", town: "Norwalk", state: "CT" }));
  assert.ok(isKnownCell({ trade: "online store", town: "Los Angeles", state: "CA" }));
  assert.ok(isKnownCell({ trade: "marketing agencies", town: "Brooklyn", state: "NY" }));
  assert.ok(isKnownCell({ trade: "accountants", town: "Boston", state: "MA" }));
  // Out of the niche: removed categories are not in the grid.
  assert.ok(!isKnownCell({ trade: "roofers", town: "Milford", state: "CT" }));
  assert.ok(!isKnownCell({ trade: "restaurants", town: "Milford", state: "CT" }));
  assert.ok(!isKnownCell({ trade: "accountants", town: "Boston", state: "CT" }));
  assert.ok(!isKnownCell({ trade: "dentists in space", town: "Milford", state: "CT" }));
});

test("categories and towns are pinned in priority order", () => {
  assert.deepEqual(TRADES.slice(0, 3), ["accountants", "bookkeepers", "tax preparers"]);
  assert.equal(TRADES[20], "property management");
  assert.equal(TRADES[21], "online store");
  assert.equal(TRADES.at(-1), "subscription box company");
  assert.deepEqual(TOWNS[0], { town: "Milford", state: "CT" });
  assert.deepEqual(TOWNS[48], { town: "Johnston", state: "RI" });
  assert.deepEqual(TOWNS[49], { town: "New York", state: "NY" });
  assert.deepEqual(TOWNS[61], { town: "Los Angeles", state: "CA" });
  assert.deepEqual(TOWNS.at(-1), { town: "Portland", state: "OR" });
});

test("every grid cell is unique", () => {
  const keys = new Set(GRID.map((c) => `${c.trade}|${c.town}|${c.state}`));
  assert.equal(keys.size, GRID.length);
});

test("pickNextCell returns the least recently run unexhausted cell", () => {
  const c = cells([
    { trade: "accountants", town: "Milford", state: "CT", last_run_at: "2026-08-20" },
    { trade: "bookkeepers", town: "Milford", state: "CT", last_run_at: "2026-08-01" },
    { trade: "tax preparers", town: "Milford", state: "CT", last_run_at: "2026-08-10" },
  ]);
  assert.equal(pickNextCell(c).trade, "bookkeepers");
});

test("a never-run cell outranks every cell that has run", () => {
  const c = cells([
    { trade: "accountants", town: "Milford", state: "CT", last_run_at: "2020-01-01" },
    { trade: "bookkeepers", town: "Milford", state: "CT" },
  ]);
  assert.equal(pickNextCell(c).trade, "bookkeepers");
});

test("stale removed-category row with the oldest last_run_at is skipped; next in-grid cell wins", () => {
  const c = cells([
    { trade: "roofers", town: "Milford", state: "CT", last_run_at: "2019-01-01" },
    { trade: "accountants", town: "Milford", state: "CT", last_run_at: "2026-08-20" },
    { trade: "bookkeepers", town: "Milford", state: "CT", last_run_at: "2026-08-01" },
  ]);
  assert.equal(pickNextCell(c).trade, "bookkeepers");
  assert.equal(pickNextCell(cells([{ trade: "roofers", town: "Milford", state: "CT" }])), null);
});

test("among never-run cells, trade order then town order decide; CT before NYC before CA", () => {
  const never = (trade, town, state) => ({ trade, town, state });
  // trade priority wins over town priority
  assert.equal(
    pickNextCell(
      cells([never("bookkeepers", "Milford", "CT"), never("accountants", "Los Angeles", "CA")])
    ).trade,
    "accountants"
  );
  // same trade: CT beats NYC beats CA regardless of input order
  const same = cells([
    never("accountants", "Los Angeles", "CA"),
    never("accountants", "Brooklyn", "NY"),
    never("accountants", "Norwalk", "CT"),
  ]);
  assert.equal(pickNextCell(same).town, "Norwalk");
  assert.equal(pickNextCell(same.filter((x) => x.state !== "CT")).town, "Brooklyn");
  // a run cell is still younger than any never-run cell
  assert.equal(
    pickNextCell(
      cells(
        [never("accountants", "Milford", "CT"), never("law firms", "Boston", "MA")].map((x, i) =>
          i ? x : { ...x, last_run_at: "2026-01-01" }
        )
      )
    ).trade,
    "law firms"
  );
});

test("pickNextCell returns null when every cell is exhausted", () => {
  const c = cells([
    { trade: "accountants", town: "Milford", state: "CT", exhausted_at: "2026-08-01" },
    { trade: "bookkeepers", town: "Milford", state: "CT", exhausted_at: "2026-08-02" },
  ]);
  assert.equal(pickNextCell(c), null);
});

test("a run of entirely known place ids exhausts the cell, and it is never picked again", () => {
  const cell = cells([{ trade: "accountants", town: "Milford", state: "CT" }])[0];
  const results = Array.from({ length: 20 }, (_, i) => ({ place_id: `p${i}`, known: true }));
  const after = evaluateRun(cell, results, new Date("2026-08-30"));
  assert.ok(after.exhausted_at, "cell not marked exhausted");
  assert.equal(after.new_rows_last_run, 0);
  assert.equal(pickNextCell([after]), null);
});

test("exactly ninety percent known is not yet exhausted", () => {
  const cell = cells([{ trade: "accountants", town: "Milford", state: "CT" }])[0];
  const results = Array.from({ length: 10 }, (_, i) => ({ place_id: `p${i}`, known: i < 9 }));
  assert.equal(evaluateRun(cell, results).exhausted_at, null);
  const harder = Array.from({ length: 20 }, (_, i) => ({ place_id: `p${i}`, known: i < 19 }));
  assert.ok(evaluateRun(cell, harder).exhausted_at);
});

test("an already-exhausted cell keeps its original exhaustion timestamp", () => {
  const cell = { trade: "accountants", town: "Milford", state: "CT", exhausted_at: "2026-01-01" };
  assert.equal(evaluateRun(cell, [{ place_id: "p", known: true }]).exhausted_at, "2026-01-01");
});

test("cellQuery renders the literal Places search string", () => {
  assert.equal(
    cellQuery({ trade: "bookkeepers", town: "Providence", state: "RI" }),
    "bookkeepers in Providence RI"
  );
});
