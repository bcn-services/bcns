/**
 * _token-db.mjs — an in-memory stand-in for the public.mcp_token_* SQL functions (migration 0031),
 * served as a `fetch` for supabaseTokenStore. It enforces what the SQL does: store needs a Bearer JWT
 * whose sub is p_user_id and an expiry in the future, lookup misses an expired row. The real
 * functions are tested in supabase/tests/rls.sql. Not a test file.
 */
export function fakeTokenDb(now) {
  const rows = new Map(); // hash -> {kind, user_id, payload, expires_at (ms)}
  const calls = []; // {fn, auth} for what each call sent as credentials
  const sub = (auth) => {
    try {
      return JSON.parse(Buffer.from(auth.split(".")[1], "base64url").toString()).sub;
    } catch {
      return null;
    }
  };
  const reply = (status, body) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status });
  async function fetchStub(url, init) {
    const fn = new URL(url).pathname.split("/").pop();
    const a = JSON.parse(init.body);
    const auth = (init.headers.Authorization ?? "").replace(/^Bearer /, "");
    calls.push({ fn, auth, apikey: init.headers.apikey });
    if (fn === "mcp_token_store") {
      if (sub(auth) !== a.p_user_id) return reply(403, { code: "42501" });
      const exp = Date.parse(a.p_expires_at);
      if (!(exp > now()) || exp > now() + 90 * 86400_000)
        return reply(400, { message: "bad expiry" });
      if (!/^[0-9a-f]{64}$/.test(a.p_hash)) return reply(400, { code: "23514" });
      rows.set(a.p_hash, {
        kind: a.p_kind,
        user_id: a.p_user_id,
        payload: a.p_payload,
        expires_at: exp,
      });
      return reply(204);
    }
    if (fn === "mcp_token_lookup") {
      const r = rows.get(a.p_hash);
      if (!r || r.expires_at <= now()) return reply(200, null);
      return reply(200, { ...r, expires_at: new Date(r.expires_at).toISOString() });
    }
    if (fn === "mcp_token_revoke") return (rows.delete(a.p_hash), reply(204));
    if (fn === "mcp_token_revoke_user") {
      if (sub(auth) !== a.p_user_id) return reply(403, { code: "42501" });
      for (const [h, r] of rows) if (r.user_id === a.p_user_id) rows.delete(h);
      return reply(204);
    }
    return reply(404);
  }
  return {
    rows,
    calls,
    fetch: fetchStub,
    count: (kind) => [...rows.values()].filter((r) => !kind || r.kind === kind).length,
  };
}
