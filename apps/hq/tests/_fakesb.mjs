/** Chainable fake of the supabase-js query builder: records every call, resolves per `table.op`. */
export function fakeSb(results = {}) {
  const log = [];
  const from = (table) => {
    let op = null;
    const q = {
      then(res, rej) {
        const r = results[`${table}.${op ?? "select"}`] ?? { data: null, error: null };
        log.push({ table, op: op ?? "select", args: q.args });
        return Promise.resolve(typeof r === "function" ? r(q.args) : r).then(res, rej);
      },
      args: {},
    };
    for (const m of ["select", "insert", "update"]) {
      q[m] = (a) => {
        if (!op && m !== "select") op = m;
        q.args[m] = a;
        return q;
      };
    }
    for (const m of ["eq", "neq", "limit", "single", "is", "gte", "order", "in", "or"]) {
      q[m] = (...a) => {
        (q.args[m] ??= []).push(a);
        return q;
      };
    }
    return q;
  };
  return { from, log };
}
