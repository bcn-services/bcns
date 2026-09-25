/**
 * /data viewer: pure/unit, no database. A fake `api` stands in for the RLS-scoped
 * supabase client: it holds rows for TWO clients, is bound to ONE, and only ever
 * returns that client's rows, like security_invoker views + RLS do. It records
 * every filter call so tests can assert what the code asked for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { EXPORT_ROW_CAP, handleExport, truncationNote } from "../lib/data-csv.ts";
import {
  cleanSearch,
  csvCell,
  csvField,
  formatCell,
  formatMoney,
  guardFormula,
  moneyMajorString,
  parseIsoDate,
  safeHref,
  searchFilter,
} from "../lib/data-format.ts";
import { PAGE_SIZE, dataHref, fetchLast30, fetchPage, last30Cutoff, paramsFromUrl, parseParams, summarizeLast30 } from "../lib/data-query.ts";
import { DATA_VIEWS, findView, selectKeys, sourceState } from "../lib/data-views.ts";
import { composeSources, dashboardUrl } from "../lib/sources.ts";

/* ------------------------------------------------------------- fake api */

function order(clientId, n, extra = {}) {
  return {
    id: `${clientId}-${String(n).padStart(6, "0")}`,
    client_id: clientId,
    source: "shopify",
    kind: "order",
    occurred_at: new Date(Date.UTC(2026, 8, 1) + (100_000 - n) * 1000).toISOString(),
    amount_minor: 1999,
    currency: "USD",
    order_number: `${clientId}-${n}`,
    status: "paid",
    items_count: 1,
    customer_external_id: "c1",
    url: null,
    ...extra,
  };
}

/** A fake schema client bound to ONE client. `calls` records every builder call in order. */
/** `opts.maxRows` emulates PostgREST's max_rows clamp: a range never returns more than that. */
function fakeApi(db, clientId, calls = [], opts = {}) {
  const rowsFor = (view) => (db[clientId] ?? {})[view] ?? [];
  return {
    calls,
    from(view) {
      return {
        select(columns) {
          const cols = columns.split(",");
          const filters = [];
          const orders = [];
          let range = null;
          const q = {
            eq: (c, v) => (calls.push(["eq", c, v]), filters.push((r) => r[c] === v), q),
            is: (c, v) => (calls.push(["is", c, v]), filters.push((r) => (r[c] ?? null) === v), q),
            gte: (c, v) => (calls.push(["gte", c, v]), filters.push((r) => r[c] >= v), q),
            lte: (c, v) => (calls.push(["lte", c, v]), filters.push((r) => r[c] <= v), q),
            lt: (c, v) => (calls.push(["lt", c, v]), filters.push((r) => r[c] < v), q),
            or: (f) => (calls.push(["or", f]), q),
            order: (c, o) => (calls.push(["order", c, o]), orders.push([c, o?.ascending !== false]), q),
            range: (a, b) => (calls.push(["range", a, b]), (range = [a, b]), q),
            then(resolve) {
              calls.push(["query", view]);
              let rows = rowsFor(view).filter((r) => filters.every((f) => f(r)));
              const count = rows.length;
              rows = [...rows].sort((x, y) => {
                for (const [c, asc] of orders) {
                  if (x[c] === y[c]) continue;
                  return (x[c] < y[c] ? -1 : 1) * (asc ? 1 : -1);
                }
                return 0;
              });
              if (range) rows = rows.slice(range[0], Math.min(range[1] + 1, range[0] + (opts.maxRows ?? Infinity)));
              // Project to the selected columns, like a real select does.
              const data = rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
              return Promise.resolve({ data, error: null, count }).then(resolve);
            },
          };
          return q;
        },
      };
    },
  };
}

const ordersCfg = findView("shopify", "orders");
const twoClients = () => ({
  A: { money_v1: [order("A", 1), order("A", 2), order("A", 3, { kind: "refund" })] },
  B: { money_v1: [order("B", 1), order("B", 2), order("B", 3)] },
});

const noClientFilter = (calls) =>
  assert.deepEqual(
    calls.filter((c) => JSON.stringify(c).includes("client_id") || JSON.stringify(c).includes('"B"')),
    [],
    "no filter may name client_id or client B"
  );

/* ------------------------------------------------------------ a: page RLS */

test("page: a request naming client B returns only the session's rows and never filters by client_id", async () => {
  const api = fakeApi(twoClients(), "A");
  // The URL tries every way of asking for another tenant.
  const params = parseParams({ client_id: "B", client: "B", clientId: "B", source: "shopify" });
  const { rows, count, error } = await fetchPage(api, ordersCfg, params);
  assert.equal(error, null);
  assert.equal(count, 2); // A's two orders; the refund is filtered by kind
  assert.deepEqual(rows.map((r) => r.order_number).sort(), ["A-1", "A-2"]);
  assert.ok(rows.every((r) => !("client_id" in r)), "client_id is never selected");
  noClientFilter(api.calls);
  assert.ok(api.calls.some((c) => c[0] === "eq" && c[1] === "source" && c[2] === "shopify"));
  assert.ok(api.calls.some((c) => c[0] === "eq" && c[1] === "kind" && c[2] === "order"));
});

test("page: selects only configured columns, never * and never storage paths", () => {
  for (const cfg of DATA_VIEWS) {
    const keys = selectKeys(cfg);
    assert.ok(!keys.includes("*"));
    assert.ok(!keys.includes("storage_path") && !keys.includes("thumb_path"), cfg.id);
    assert.ok(keys.includes(cfg.tieBreak));
  }
});

test("page: 50 rows per page, date desc then id, and page N asks for the right range", async () => {
  const api = fakeApi({ A: { money_v1: Array.from({ length: 120 }, (_, i) => order("A", i + 1)) } }, "A");
  const { rows, count, start } = await fetchPage(api, ordersCfg, parseParams({ page: "3" }));
  assert.equal(PAGE_SIZE, 50);
  assert.equal(count, 120);
  assert.equal(start, 100);
  assert.equal(rows.length, 20);
  assert.deepEqual(api.calls.find((c) => c[0] === "range"), ["range", 100, 149]);
  const orders = api.calls.filter((c) => c[0] === "order").map((c) => [c[1], c[2].ascending]);
  assert.deepEqual(orders, [["occurred_at", false], ["id", true]]);
});

test("page: to is inclusive of the whole day for timestamptz, and a plain <= for date columns", async () => {
  const a1 = fakeApi(twoClients(), "A");
  await fetchPage(a1, ordersCfg, parseParams({ from: "2026-09-01", to: "2026-09-30" }));
  assert.ok(a1.calls.some((c) => c[0] === "gte" && c[2] === "2026-09-01"));
  assert.ok(a1.calls.some((c) => c[0] === "lt" && c[1] === "occurred_at" && c[2] === "2026-10-01"));
  const a2 = fakeApi(twoClients(), "A");
  await fetchPage(a2, findView("meta", "campaigns"), parseParams({ to: "2026-12-31" }));
  assert.ok(a2.calls.some((c) => c[0] === "lte" && c[1] === "day" && c[2] === "2026-12-31"));
});

test("page: liveOnly views hide soft-deleted rows", async () => {
  const api = fakeApi({ A: {} }, "A");
  await fetchPage(api, findView("drive", "files"), parseParams({}));
  assert.ok(api.calls.some((c) => c[0] === "is" && c[1] === "deleted_at" && c[2] === null));
});

test("page: liveOnly hides soft-deleted rows in the result, not just in the call log", async () => {
  const file = (id, deleted_at) => ({ id, client_id: "A", source: "drive", filename: `${id}.png`, created_at: "2026-09-01T00:00:00Z", deleted_at });
  const api = fakeApi({ A: { media_v1: [file("live", null), file("gone", "2026-09-02T00:00:00Z")] } }, "A");
  const { rows } = await fetchPage(api, findView("drive", "files"), parseParams({}));
  assert.deepEqual(rows.map((r) => r.filename), ["live.png"]);
});

/* ------------------------------------------------------------- b: CSV RLS */

const csvUrl = (qs) => new Request(`https://hub.test/data/export?${qs}`);

test("csv: a request naming client B exports only the session's rows, no client_id filter", async () => {
  const api = fakeApi(twoClients(), "A");
  const res = await handleExport(csvUrl("source=shopify&view=orders&client_id=B&client=B"), {
    getSession: async () => ({ api }),
  });
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /A-1/);
  assert.match(body, /A-2/);
  assert.doesNotMatch(body, /B-\d/);
  noClientFilter(api.calls);
});

test("csv: signed out is 401 (not a redirect) and runs no query", async () => {
  let asked = 0;
  const res = await handleExport(csvUrl("source=shopify&view=orders"), {
    getSession: async () => (asked++, null),
  });
  assert.equal(res.status, 401);
  assert.equal(res.headers.get("location"), null);
  assert.equal(asked, 1); // no session means there is no api handle to query with at all
});

test("csv: unknown source or view is 404 and runs no query", async () => {
  const api = fakeApi(twoClients(), "A");
  for (const qs of ["source=nope&view=orders", "source=shopify&view=nope", "source=meta&view=orders", ""]) {
    const res = await handleExport(csvUrl(qs), { getSession: async () => ({ api }) });
    assert.equal(res.status, 404, qs);
  }
  assert.deepEqual(api.calls, []);
});

test("csv: headers, filename, labels, and money as major units with the currency column kept", async () => {
  const api = fakeApi({ A: { money_v1: [order("A", 1, { amount_minor: 1999, currency: "EUR" })] } }, "A");
  const res = await handleExport(csvUrl("source=shopify&view=orders&from=2026-09-01&to=2026-09-30"), {
    getSession: async () => ({ api }),
  });
  assert.equal(res.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("content-disposition"), "attachment; filename=shopify-orders-2026-09-01_2026-09-30.csv");
  const [head, row] = (await res.text()).split("\r\n");
  assert.equal(head, "Order,Placed,Total,Status,Items,Customer ID,Link,Currency");
  assert.match(row, /^A-1,2026-09-\d\dT[\d:.]+Z,19\.99,paid,1,c1,,EUR$/);
});

test("csv: a mid-stream query failure errors the stream instead of truncating quietly", async () => {
  const rows = Array.from({ length: 25 }, (_, i) => order("A", i + 1));
  const inner = fakeApi({ A: { money_v1: rows } }, "A");
  let n = 0;
  const api = {
    from: (view) => ({
      select: (cols) => {
        const q = inner.from(view).select(cols);
        const realThen = q.then;
        q.then = (resolve) =>
          ++n === 2 ? Promise.resolve({ data: null, error: { message: "boom" } }).then(resolve) : realThen(resolve);
        return q;
      },
    }),
  };
  const res = await handleExport(csvUrl("source=shopify&view=orders"), { getSession: async () => ({ api }), chunk: 10 });
  assert.equal(res.status, 200);
  await assert.rejects(res.text(), /boom/);
});

test("csv: a failure on the first query is a 502, not a 200", async () => {
  const api = { from: () => ({ select: () => ({ eq() { return this; }, is() { return this; }, gte() { return this; }, lt() { return this; }, lte() { return this; }, or() { return this; }, order() { return this; }, range() { return this; }, then: (r) => Promise.resolve({ data: null, error: { message: "x" } }).then(r) }) }) };
  const res = await handleExport(csvUrl("source=shopify&view=orders"), { getSession: async () => ({ api }) });
  assert.equal(res.status, 502);
});

/* ----------------------------------------------------------------- d: cap */

async function exportWith(count, opts, fake = {}) {
  const rows = Array.from({ length: count }, (_, i) => order("A", i + 1));
  const api = fakeApi({ A: { money_v1: rows } }, "A", [], fake);
  const res = await handleExport(csvUrl("source=shopify&view=orders"), { getSession: async () => ({ api }), ...opts });
  const lines = (await res.text()).split("\r\n").filter(Boolean);
  return { lines, header: lines[0], data: lines.filter((l, i) => i > 0 && !l.startsWith("# ")), marker: lines.filter((l) => l.startsWith("# ")), api };
}

test("csv cap: more rows than the cap gives exactly cap rows plus the truncation marker", async () => {
  const { data, marker, lines } = await exportWith(2501, { cap: 2500, chunk: 1000 });
  assert.equal(data.length, 2500);
  assert.deepEqual(marker, ["# Export truncated at 2,500 rows. Narrow the date range to export the rest."]);
  assert.ok(lines.at(-1).startsWith("# "), "marker is the final line");
  assert.match(data.at(-1), /^A-2500,/);
});

test("csv cap: exactly the cap, or fewer, has no marker", async () => {
  for (const n of [2500, 2499, 1000, 1, 0]) {
    const { data, marker } = await exportWith(n, { cap: 2500, chunk: 1000 });
    assert.equal(data.length, n, `n=${n}`);
    assert.deepEqual(marker, [], `n=${n}`);
  }
});

test("csv cap: chunk boundaries neither drop nor repeat rows", async () => {
  const { data } = await exportWith(2350, { cap: 5000, chunk: 1000 });
  assert.equal(data.length, 2350);
  assert.equal(new Set(data.map((l) => l.split(",")[0])).size, 2350);
});

test("csv: a server that returns fewer rows than asked (max_rows 300 < chunk 1000) still exports everything", async () => {
  const { data, marker } = await exportWith(1234, { cap: 5000, chunk: 1000 }, { maxRows: 300 });
  assert.equal(data.length, 1234);
  assert.equal(new Set(data.map((l) => l.split(",")[0])).size, 1234);
  assert.deepEqual(marker, []);
});

test("csv cap: the cap and its probe stay exact when the server clamps chunks", async () => {
  for (const [n, marked] of [[2501, true], [2500, false], [2499, false], [2400, false]]) {
    const { data, marker } = await exportWith(n, { cap: 2500, chunk: 1000 }, { maxRows: 300 });
    assert.equal(data.length, Math.min(n, 2500), `n=${n}`);
    assert.equal(marker.length, marked ? 1 : 0, `n=${n}`);
  }
});

test("csv cap: the default cap is 50,000 and 50,001 rows hit it", async () => {
  assert.equal(EXPORT_ROW_CAP, 50_000);
  assert.equal(truncationNote(), "Export truncated at 50,000 rows. Narrow the date range to export the rest.");
  const { data, marker } = await exportWith(50_001, {});
  assert.equal(data.length, 50_000);
  assert.deepEqual(marker, ["# Export truncated at 50,000 rows. Narrow the date range to export the rest."]);
});

/* ---------------------------------------------------------------- c: url */

test("dashboardUrl falls back to /data; app_url wins; no client is null", () => {
  assert.equal(dashboardUrl({ slug: "acme" }), "/data");
  assert.equal(dashboardUrl({ slug: "acme", app_url: "https://acme.example.com" }), "https://acme.example.com");
  assert.equal(dashboardUrl(null), null);
});

/* ---------------------------------------------------------------- e: money */

test("money: minor to major with the currency's own decimals; missing input is safe", () => {
  assert.equal(formatMoney(1999, "USD"), "$19.99");
  assert.equal(formatMoney(1999, "EUR"), "€19.99");
  assert.equal(formatMoney(1999, "JPY"), "¥1,999"); // zero-decimal: no /100
  assert.equal(formatMoney(-500, "USD"), "-$5.00");
  assert.equal(formatMoney("1999", "USD"), "$19.99");
  assert.equal(formatMoney(1999, null), "19.99");
  assert.equal(formatMoney(1999, "ZZZ9"), "19.99 ZZZ9"); // invalid code does not throw
  for (const bad of [null, undefined, NaN, "", "abc", Infinity]) assert.equal(formatMoney(bad, "USD"), "");
  assert.equal(moneyMajorString(1999, "USD"), "19.99");
  assert.equal(moneyMajorString(1999, "JPY"), "1999");
  assert.equal(moneyMajorString(1999, "KWD"), "1.999");
  assert.equal(moneyMajorString(undefined, "USD"), null);
});

test("cells: money column reads its row's currency; details is pretty JSON; links are http(s) only", () => {
  const col = { key: "total_spent_minor", label: "Total spent", type: "money", currencyKey: "currency" };
  assert.equal(formatCell(col, { total_spent_minor: 250000, currency: "USD" }), "$2,500.00");
  assert.equal(formatCell({ key: "is_done", label: "Done", type: "text" }, { is_done: true }), "Yes");
  assert.equal(formatCell({ key: "bytes", label: "Size", type: "bytes" }, { bytes: 1536 }), "1.5 KB");
  assert.equal(formatCell({ key: "d", label: "D", type: "datetime" }, { d: "2026-09-16T04:00:59Z" }), "2026-09-16 04:00");
  assert.equal(safeHref("https://x.test/a"), "https://x.test/a");
  assert.equal(safeHref("javascript:alert(1)"), null);
});

test("last 30 days: cutoff is today-30, sums per currency, tolerates no rows", () => {
  assert.equal(last30Cutoff(new Date("2026-09-24T15:00:00Z")), "2026-08-26"); // 30 calendar days incl. today
  assert.deepEqual(summarizeLast30([]), { orders: 0, revenue: [] });
  assert.deepEqual(summarizeLast30(null), { orders: 0, revenue: [] });
  const s = summarizeLast30([
    { orders: 2, revenue_minor: 1000, currency: "USD" },
    { orders: "3", revenue_minor: "500", currency: "USD" },
    { orders: 1, revenue_minor: 700, currency: "EUR" },
  ]);
  assert.equal(s.orders, 6);
  assert.deepEqual(s.revenue, [{ currency: "USD", minor: 1500 }, { currency: "EUR", minor: 700 }]);
});

test("last 30 days: a failed read is reported as an error, never zeroed", async () => {
  const failing = { from: () => ({ select: () => { const q = { gte: () => q, order: () => q, then: (r) => Promise.resolve({ data: null, error: { message: "denied" } }).then(r) }; return q; } }) };
  assert.deepEqual(await fetchLast30(failing, new Date("2026-09-24T00:00:00Z")), { totals: null, error: "denied" });
  const api = fakeApi({ A: { daily_summary_v1: [{ day: "2026-09-20", orders: 2, revenue_minor: 500, currency: "USD" }, { day: "2026-08-01", orders: 9, revenue_minor: 9, currency: "USD" }] } }, "A");
  const ok = await fetchLast30(api, new Date("2026-09-24T00:00:00Z"));
  assert.equal(ok.error, null);
  assert.deepEqual(ok.totals, { orders: 2, revenue: [{ currency: "USD", minor: 500 }] });
  assert.deepEqual(api.calls.find((c) => c[0] === "gte"), ["gte", "day", "2026-08-26"]);
});

/* ------------------------------------------------------- f: empty states */

test("empty state: never_ran is 'first sync in progress', no row is 'Not connected', ok is ready", () => {
  const by = Object.fromEntries(
    composeSources([
      { source: "meta", status: "never_ran", last_success_at: null, last_error: null },
      { source: "shopify", status: "ok", last_success_at: "2026-09-24T00:00:00Z", last_error: null },
      { source: "monday", status: "auth_failed", last_success_at: null, last_error: null },
    ]).map((c) => [c.source, c])
  );
  assert.deepEqual(sourceState(by.meta), { kind: "pending", message: "Connected, first sync in progress" });
  assert.deepEqual(sourceState(by.meet), { kind: "none", message: "Not connected" });
  assert.equal(sourceState(by.shopify).kind, "ready");
  assert.equal(sourceState(by.monday).kind, "reconnect");
});

/* ------------------------------------------- g: search, dates, csv quoting */

/** Split a PostgREST `.or()` value into clauses the way PostgREST does: commas inside "..." are inert. */
function orClauses(value) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quoted && ch === "\\") cur += ch + value[++i];
    else if (ch === '"') {
      quoted = !quoted;
      cur += ch;
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return { clauses: out, balanced: !quoted };
}

test("search: hostile input cannot add or alter filter clauses", () => {
  const cols = ["order_number", "external_id", "customer_external_id"];
  const hostile = [
    'x",client_id.eq.B,"y',
    "a),(client_id.eq.B",
    "x,client_id.eq.B",
    '"; drop',
    "50%_off\\",
    "a\nb,client_id.eq.B",
    "*",
    "'; --",
  ];
  for (const term of hostile) {
    const f = searchFilter(term, cols);
    if (f === null) continue; // e.g. "*" cleans to nothing
    const { clauses, balanced } = orClauses(f);
    assert.ok(balanced, `balanced quotes for ${JSON.stringify(term)}`);
    assert.equal(clauses.length, cols.length, `exactly one clause per column for ${JSON.stringify(term)}`);
    clauses.forEach((c, i) => {
      assert.ok(c.startsWith(`${cols[i]}.ilike."%`) && c.endsWith('%"'), c);
    });
    assert.doesNotMatch(f.replace(/"(?:\\.|[^"\\])*"/g, '""'), /client_id/, "hostile text stays inside quotes");
  }
});

test("search: % _ and backslash are literals, * is dropped, length is capped, empty is no filter", () => {
  assert.equal(searchFilter("50%_off", ["a"]), 'a.ilike."%50\\\\%\\\\_off%"');
  assert.equal(searchFilter("*", ["a"]), null);
  assert.equal(searchFilter("   ", ["a"]), null);
  assert.equal(searchFilter("x", []), null);
  assert.equal(cleanSearch("y".repeat(500)).length, 100);
  assert.equal(cleanSearch(["a"]), "");
});

test("dates: strict YYYY-MM-DD only; junk is ignored, not passed to the query", async () => {
  assert.equal(parseIsoDate("2026-09-24"), "2026-09-24");
  for (const bad of ["2026-9-24", "2026-13-01", "2026-02-30", "2026-09-24T00:00", "24/09/2026", "'; drop", "", " 2026-09-24", null, undefined, ["2026-09-24"], "0000-01-01", "9999-12-31", "1899-12-31", "2101-01-01"]) {
    assert.equal(parseIsoDate(bad), null, JSON.stringify(bad));
  }
  const api = fakeApi(twoClients(), "A");
  await fetchPage(api, ordersCfg, parseParams({ from: "junk", to: "2026-99-99", page: "-4", q: "" }));
  assert.ok(!api.calls.some((c) => ["gte", "lt", "lte", "or"].includes(c[0])));
  assert.equal(parseIsoDate("1900-01-01"), "1900-01-01");
  assert.equal(parseIsoDate("2100-12-31"), "2100-12-31");
  assert.equal(parseParams({ page: "abc" }).page, 1);
  assert.equal(parseParams({ page: ["2", "3"] }).page, 2);
});

test("params from a URL: the first of a repeated param wins, as on the page", () => {
  const raw = paramsFromUrl(new URL("https://hub.test/data/export?from=2026-01-01&from=junk&q=a&q=b"));
  assert.equal(raw.from, "2026-01-01");
  assert.equal(parseParams(raw).q, "a");
  const p = parseParams({ from: ["2026-01-01", "junk"] }); // what the page passes for a repeated param
  assert.equal(p.from, parseParams(raw).from);
});

test("hrefs: params are URL-encoded and defaults omitted", () => {
  assert.equal(dataHref("/data", { source: "shopify", view: "orders", page: 1 }), "/data?source=shopify&view=orders");
  assert.equal(
    dataHref("/data/export", { source: "shopify", view: "orders", page: 3, from: "2026-09-01", q: "a&b=c" }),
    "/data/export?source=shopify&view=orders&page=3&from=2026-09-01&q=a%26b%3Dc"
  );
});

test("csv cells: formula-injection prefix on text, RFC 4180 quoting, numbers untouched", () => {
  for (const s of ["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"]) assert.equal(guardFormula(s), `'${s}`);
  assert.equal(guardFormula("plain"), "plain");
  const text = { key: "t", label: "T", type: "text" };
  assert.equal(csvCell(text, { t: "=HYPERLINK(\"x\")" }), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell(text, { t: "a,b" }), '"a,b"');
  assert.equal(csvCell(text, { t: 'say "hi"' }), '"say ""hi"""');
  assert.equal(csvCell(text, { t: "line1\nline2" }), '"line1\nline2"');
  assert.equal(csvCell(text, { t: null }), "");
  assert.equal(csvCell({ key: "n", label: "N", type: "number" }, { n: -5 }), "-5");
  assert.equal(csvCell({ key: "m", label: "M", type: "money", currencyKey: "c" }, { m: -1999, c: "USD" }), "-19.99");
  assert.equal(csvCell({ key: "a", label: "A", type: "details" }, { a: { k: "v,1" } }), '"{""k"":""v,1""}"');
  assert.equal(csvField("plain"), "plain");
  assert.equal(csvField(""), "");
});

test("csv end to end: a row with a formula and a comma comes out safe", async () => {
  const api = fakeApi({ A: { money_v1: [order("A", 1, { order_number: "=cmd|' /C calc'!A0", status: "a,b" })] } }, "A");
  const res = await handleExport(csvUrl("source=shopify&view=orders"), { getSession: async () => ({ api }) });
  const row = (await res.text()).split("\r\n")[1];
  assert.ok(row.startsWith("'=cmd|' /C calc'!A0,"), row);
  assert.ok(row.includes('"a,b"'));
});

/* ------------------------------------------- access rule, checked in source */

const root = new URL("../", import.meta.url);
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const dataSources = [
  "app/data/export/route.ts",
  "app/data/page.tsx",
  "app/data/DataTable.tsx",
  ...readdirSync(new URL("lib/", root)).filter((f) => /^data-.*\.ts$/.test(f)).map((f) => `lib/${f}`),
].map((f) => [f, stripComments(readFileSync(new URL(f, root), "utf8"))]);

test("source: no data file uses a service-role/admin client or names a client_id", () => {
  assert.ok(dataSources.length >= 7);
  for (const [file, code] of dataSources) {
    assert.doesNotMatch(code, /service_role|SERVICE_ROLE|createAdmin|createClient\b|@supabase\/supabase-js|process\.env/i, file);
    assert.doesNotMatch(code, /client_id|clientId|client-id/, `${file} must not read or filter by a client id`);
  }
});

test("source: the export route and page read only through the signed-in session", () => {
  const code = Object.fromEntries(dataSources);
  assert.match(code["app/data/export/route.ts"], /import \{[^}]*\bmemberSession\b[^}]*\} from "@\/lib\/session"/);
  assert.match(code["app/data/export/route.ts"], /await memberSession\(\)/);
  assert.match(code["app/data/page.tsx"], /await requireHub\(\)/);
});
