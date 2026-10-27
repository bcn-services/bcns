/**
 * _mcp-fake.mjs — in-memory stand-in for the slice of the Supabase query builder the MCP tools reach
 * (eq/neq/in/ilike/is/lte filters, order, limit, single/maybeSingle, insert/update + select).
 * `ops` records EVERY call as { table, op, payload, cols }, reads included, so a test can assert which
 * tables a tool touched and how. Not a test file.
 */
import { randomUUID } from "node:crypto";

export function mcpFake(initial = {}) {
  const db = Object.fromEntries(
    Object.entries(initial).map(([t, rows]) => [t, rows.map((r) => ({ ...r }))])
  );
  const ops = [];
  function from(table) {
    const rows = (db[table] ??= []);
    const q = { op: "select", payload: null, cols: null, filters: [], lim: null, mode: null };
    const api = {
      select: (cols) => ((q.cols ??= cols ?? "*"), api),
      insert: (p) => ((q.op = "insert"), (q.payload = p), api),
      update: (p) => ((q.op = "update"), (q.payload = p), api),
      eq: (c, v) => (q.filters.push((r) => r[c] === v), api),
      neq: (c, v) => (q.filters.push((r) => r[c] !== v), api),
      in: (c, vs) => (q.filters.push((r) => vs.includes(r[c])), api),
      is: (c, v) => (q.filters.push((r) => (r[c] ?? null) === v), api),
      lte: (c, v) => (q.filters.push((r) => r[c] != null && r[c] <= v), api),
      ilike: (c, pat) => {
        const needle = pat.replace(/%/g, "").toLowerCase();
        q.filters.push((r) =>
          String(r[c] ?? "")
            .toLowerCase()
            .includes(needle)
        );
        return api;
      },
      order: () => api,
      limit: (n) => ((q.lim = n), api),
      single: () => ((q.mode = "single"), api),
      maybeSingle: () => ((q.mode = "maybe"), api),
      then: (res, rej) => Promise.resolve(exec()).then(res, rej),
    };
    function exec() {
      ops.push({ table, op: q.op, payload: q.payload, cols: q.cols });
      let out;
      if (q.op === "insert") {
        out = (Array.isArray(q.payload) ? q.payload : [q.payload]).map((p) => ({
          id: randomUUID(),
          ...p,
        }));
        rows.push(...out);
      } else {
        out = rows.filter((r) => q.filters.every((f) => f(r)));
        if (q.op === "update") out.forEach((r) => Object.assign(r, q.payload));
        if (q.lim != null) out = out.slice(0, q.lim);
        if (q.op === "select" && q.cols && q.cols !== "*") {
          const want = q.cols.split(",").map((c) => c.trim()); // honour the column list, like PostgREST
          out = out.map((r) =>
            Object.fromEntries(want.filter((c) => c in r).map((c) => [c, r[c]]))
          );
        }
      }
      if (q.mode === "single")
        return out[0]
          ? { data: out[0], error: null }
          : { data: null, error: { message: "no row" } };
      if (q.mode === "maybe") return { data: out[0] ?? null, error: null };
      return { data: out, error: null };
    }
    return api;
  }
  return { from, db, ops };
}
