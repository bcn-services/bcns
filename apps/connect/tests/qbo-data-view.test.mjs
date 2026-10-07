/**
 * QuickBooks Expenses on /data: pure/unit. A fake `api` holds a MIXED records_v1 (monday records,
 * quickbooks expenses, another quickbooks kind), applies the filters the code asks for, and
 * understands `alias:attributes->>name` selects and `attributes->>name.ilike` or-filters, so a
 * dropped filter or a wrong select visibly changes what comes back.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleExport } from "../lib/data-csv.ts";
import { csvCell, formatCell } from "../lib/data-format.ts";
import { fetchCounts30, fetchPage, parseParams } from "../lib/data-query.ts";
import { STAT_IDS, buildCatalog } from "../lib/data-stats.ts";
import { DATA_VIEWS, composeDataPage, findView, selectKeys, viewsFor } from "../lib/data-views.ts";
import { HUB_SOURCES, composeSources } from "../lib/sources.ts";

const NOW = new Date("2026-09-24T15:00:00Z");
const cfg = findView("quickbooks", "expenses");

const exp = (id, occurred_at, attributes) => ({
  id, source: "quickbooks", kind: "qbo_expense", occurred_at,
  attributes: { date: occurred_at.slice(0, 10), currency: "USD", account: "Supplies", txn_type: "Purchase", payment_type: "Cash", memo: null, ...attributes },
});
const ROWS = [
  exp("q1", "2026-09-20T00:00:00Z", { vendor: "Globex Supply", amount_cents: 12345, memo: "Packing tape" }),
  exp("q2", "2026-09-10T00:00:00Z", { vendor: "Initech", amount_cents: -5000, memo: "Refund for returned chairs", txn_type: "Bill", payment_type: null }),
  exp("q3", "2026-09-05T00:00:00Z", { vendor: "Umbrella KK", amount_cents: 150000, currency: "JPY", memo: "Monthly invoice" }),
  { id: "q4", source: "quickbooks", kind: "qbo_account", occurred_at: "2026-09-20T00:00:00Z", attributes: { vendor: "Globex Supply", memo: "not an expense" } },
  { id: "m1", source: "monday", kind: "item", occurred_at: "2026-09-20T00:00:00Z", attributes: { vendor: "Globex Supply" } },
];

const cell = (r, name) => (r.attributes[name] == null ? null : String(r.attributes[name]));

function fakeApi(rows = ROWS, calls = []) {
  return {
    calls,
    from(view) {
      return {
        select(columns, options) {
          calls.push(["select", view, columns, options]);
          const filters = [];
          const orders = [];
          let range = null;
          const q = {
            eq: (c, v) => (calls.push(["eq", c, v]), filters.push((r) => r[c] === v), q),
            is: (c, v) => (calls.push(["is", c, v]), q),
            gte: (c, v) => (calls.push(["gte", c, v]), filters.push((r) => r[c] >= v), q),
            lte: (c, v) => (calls.push(["lte", c, v]), filters.push((r) => r[c] <= v), q),
            lt: (c, v) => (calls.push(["lt", c, v]), filters.push((r) => r[c] < v), q),
            or: (f) => {
              calls.push(["or", f]);
              const terms = [...f.matchAll(/attributes->>([a-z_]+)\.ilike\."%([^"]*)%"/g)].map((m) => [m[1], m[2].toLowerCase()]);
              filters.push((r) => terms.some(([name, t]) => (cell(r, name) ?? "").toLowerCase().includes(t)));
              return q;
            },
            order: (c, o) => (calls.push(["order", c, o]), orders.push([c, o?.ascending !== false]), q),
            range: (a, b) => (calls.push(["range", a, b]), (range = [a, b]), q),
            then(resolve) {
              let out = rows.filter((r) => filters.every((f) => f(r)));
              const count = out.length;
              out = [...out].sort((x, y) => {
                for (const [c, asc] of orders) if (x[c] !== y[c]) return (x[c] < y[c] ? -1 : 1) * (asc ? 1 : -1);
                return 0;
              });
              if (range) out = out.slice(range[0], range[1] + 1);
              const data = out.map((r) =>
                Object.fromEntries(
                  columns.split(",").map((c) => {
                    const m = /^([a-z_]+):attributes->>([a-z_]+)$/.exec(c);
                    return m ? [m[1], cell(r, m[2])] : [c, r[c]];
                  })
                )
              );
              return Promise.resolve({ data, error: null, count }).then(resolve);
            },
          };
          return q;
        },
      };
    },
  };
}

const P = (raw = {}) => parseParams(raw);
const ids = (rows) => rows.map((r) => r.id).sort();

test("qbo view: config shape, real columns in order, no blob, every attr name a safe constant", () => {
  assert.ok(cfg);
  assert.deepEqual(cfg.columns.map((c) => c.label), ["Date", "Vendor", "Amount", "Account", "Type", "Payment type", "Memo"]);
  assert.ok(!cfg.columns.some((c) => c.type === "details" || c.key === "attributes"));
  for (const v of Object.values(cfg.attrs)) assert.match(v, /^[a-z_]+$/);
  const keys = selectKeys(cfg);
  for (const [alias, name] of Object.entries(cfg.attrs)) assert.ok(keys.includes(`${alias}:attributes->>${name}`), alias);
  assert.ok(!keys.includes("currency") && !keys.includes("attributes"), "no bare currency column, no blob");
  assert.ok(keys.includes("id"));
});

test("qbo view: only qbo_expense rows come back (the kind filter keeps other records out)", async () => {
  const api = fakeApi();
  const { rows, count, error } = await fetchPage(api, cfg, P());
  assert.equal(error, null);
  assert.equal(count, 3);
  assert.deepEqual(ids(rows), ["q1", "q2", "q3"]);
  assert.ok(api.calls.some((c) => c[0] === "eq" && c[1] === "kind" && c[2] === "qbo_expense"));
  assert.ok(api.calls.some((c) => c[0] === "eq" && c[1] === "source" && c[2] === "quickbooks"));
  // Rows carry the named fields out of attributes.
  assert.deepEqual(rows[0], { date: "2026-09-20", vendor: "Globex Supply", amount: "12345", currency: "USD", account: "Supplies", txn_type: "Purchase", payment_type: "Cash", memo: "Packing tape", id: "q1" });
});

test("qbo view: search covers vendor and memo, and the or-string names both attribute paths", async () => {
  const api = fakeApi();
  const byVendor = await fetchPage(api, cfg, P({ q: "globex" }));
  assert.deepEqual(ids(byVendor.rows), ["q1"]); // q4 / m1 also say Globex but are not expenses
  const byMemo = await fetchPage(api, cfg, P({ q: "invoice" }));
  assert.deepEqual(ids(byMemo.rows), ["q3"]);
  const or = api.calls.find((c) => c[0] === "or")[1];
  assert.ok(or.includes("attributes->>vendor.ilike") && or.includes("attributes->>memo.ilike"), or);
});

test("qbo view: from/to filter runs on occurred_at, to inclusive of its whole day", async () => {
  const api = fakeApi();
  const { rows } = await fetchPage(api, cfg, P({ from: "2026-09-10", to: "2026-09-20" }));
  assert.deepEqual(ids(rows), ["q1", "q2"]);
  assert.ok(api.calls.some((c) => c[0] === "gte" && c[1] === "occurred_at" && c[2] === "2026-09-10"));
  assert.ok(api.calls.some((c) => c[0] === "lt" && c[1] === "occurred_at" && c[2] === "2026-09-21"));
});

test("qbo view: amount is value x 100 for every currency; shown and exported in major units with the row's symbol", async () => {
  const { rows } = await fetchPage(fakeApi(), cfg, P());
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  const amount = cfg.columns.find((c) => c.key === "amount");
  assert.equal(formatCell(amount, by.q1), "$123.45");
  assert.equal(formatCell(amount, by.q2), "-$50.00");
  assert.equal(formatCell(amount, by.q3), "¥1,500"); // not ¥150,000
  assert.equal(csvCell(amount, by.q1), "123.45");
  assert.equal(csvCell(amount, by.q2), "-50.00");
  assert.equal(csvCell(amount, by.q3), "1500"); // not 150000
  assert.equal(formatCell(cfg.columns[0], by.q1), "2026-09-20");
  assert.equal(formatCell(cfg.columns[5], by.q2), ""); // Bill: no payment type
});

test("qbo view: CSV export works like the other views (filtered, currency column, major units)", async () => {
  const calls = [];
  const res = await handleExport(new Request("http://x/data/export?source=quickbooks&view=expenses&q=initech"), { getSession: async () => ({ api: fakeApi(ROWS, calls) }) });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Content-Disposition"), /quickbooks-expenses-all_all\.csv/);
  const lines = (await res.text()).trim().split("\r\n");
  assert.equal(lines[0], "Date,Vendor,Amount,Account,Type,Payment type,Memo,Currency");
  assert.equal(lines[1], "2026-09-10,Initech,-50.00,Supplies,Bill,,Refund for returned chairs,USD");
  assert.equal(lines.length, 2);
  assert.ok(calls.find((c) => c[0] === "select")[2].includes("vendor:attributes->>vendor"));
});

test("qbo view: joins the 30-day count and stat strip", async () => {
  const counts = await fetchCounts30(fakeApi(), [cfg], NOW);
  assert.deepEqual(counts, { "quickbooks/expenses": 3 }); // cutoff 2026-08-26; q4 and m1 are other kinds/sources
  assert.ok(STAT_IDS.includes("quickbooks/expenses"));
  const stat = buildCatalog(["quickbooks"], { counts, last30: null, meta: null }).find((s) => s.id === "quickbooks/expenses");
  assert.deepEqual(stat && [stat.label, stat.value], ["Expenses, 30 days", "3"]);
});

test("qbo view: a connected QuickBooks card gets a tab with views; every hub source has a view", () => {
  const cards = composeSources([{ source: "quickbooks", status: "ok", last_success_at: "2026-09-20T04:00:00Z", last_error: null }]);
  const page = composeDataPage(cards, { wanted: "quickbooks" });
  assert.equal(page.card?.source, "quickbooks");
  assert.equal(page.fetchesPage, true);
  assert.ok(viewsFor(page.card.source).length >= 1);
  for (const s of HUB_SOURCES) assert.ok(DATA_VIEWS.some((v) => v.source === s), `${s} has no data view`);
});
