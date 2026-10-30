/**
 * _fake-sb.mjs — in-memory stand-in for the slice of the Supabase query builder tasks.ts / proposals.ts /
 * seed-gtm use. `captured` records every insert (with the id the fake assigned) and update patch, so
 * proposals-rpc.test.mjs can replay them against the real local schema. Not a test file.
 */
import { randomUUID } from "node:crypto";

export function fakeSb(initial = {}, { failOn = {} } = {}) {
  const db = Object.fromEntries(
    Object.entries(initial).map(([t, rows]) => [t, rows.map((r) => ({ ...r }))])
  );
  const captured = [];
  function from(table) {
    const rows = (db[table] ??= []);
    const q = { op: "select", payload: null, filters: [], lim: null, mode: null };
    const api = {
      select: () => api,
      insert: (p) => ((q.op = "insert"), (q.payload = p), api),
      delete: () => ((q.op = "delete"), api),
      update: (p) => ((q.op = "update"), (q.payload = p), api),
      eq: (c, v) => (q.filters.push((r) => r[c] === v), api),
      neq: (c, v) => (q.filters.push((r) => r[c] !== v), api),
      in: (c, vs) => (q.filters.push((r) => vs.includes(r[c])), api),
      order: () => api,
      limit: (n) => ((q.lim = n), api),
      single: () => ((q.mode = "single"), api),
      maybeSingle: () => ((q.mode = "maybe"), api),
      then: (res, rej) => Promise.resolve(exec()).then(res, rej),
    };
    function exec() {
      const fail = failOn[`${table}:${q.op}`] ?? failOn[table]; // "tasks:insert" fails one op only
      if (fail) return { data: null, error: { message: fail } };
      let out;
      if (q.op === "insert") {
        out = (Array.isArray(q.payload) ? q.payload : [q.payload]).map((p) => ({
          id: randomUUID(),
          ...p,
        }));
        out.forEach(
          (r) => (
            rows.push(r),
            captured.push({ table, op: "insert", row: { ...r }, payload: { ...r } })
          )
        );
        // payload keys = what the code sent (no fake-assigned id)
        out.forEach((r, i) => {
          const sent = Array.isArray(q.payload) ? q.payload[i] : q.payload;
          captured[captured.length - out.length + i].payload = { ...sent };
        });
      } else {
        out = rows.filter((r) => q.filters.every((f) => f(r)));
        if (q.op === "update") {
          out.forEach((r) => Object.assign(r, q.payload));
          captured.push({ table, op: "update", payload: { ...q.payload } });
        }
        if (q.op === "delete") {
          for (const r of out) rows.splice(rows.indexOf(r), 1);
          captured.push({ table, op: "delete" });
        }
        if (q.lim != null) out = out.slice(0, q.lim);
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
  return { from, db, captured };
}
