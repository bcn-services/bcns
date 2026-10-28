// HQ's read-only ops role (migration *_hq_ops_ro.sql): schema `ops` is four metadata-only views, and
// hq_ops_ro can read those and nothing in data/api/public. A local test-only password is set here
// and removed after; the real one is Nate's (alter role by hand). Needs the local stack.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { DB_URL, pool, sql } from "./helpers.js";

const PW = `hq-ops-test-${randomUUID()}`;
const VIEWS = ["connector_health", "connector_runs_7d", "tickets_open", "clients"];
const opened: pg.Client[] = [];

async function asRole(): Promise<pg.Client> {
  const u = new URL(DB_URL);
  u.username = "hq_ops_ro";
  u.password = PW;
  const c = new pg.Client({ connectionString: u.toString() });
  await c.connect();
  opened.push(c);
  return c;
}

beforeAll(async () => {
  await sql(`alter role hq_ops_ro password '${PW}'`);
});
// The role allows 3 connections: every test closes its own.
afterEach(async () => {
  await Promise.all(opened.splice(0).map((c) => c.end().catch(() => {})));
});
afterAll(async () => {
  await sql(`alter role hq_ops_ro password null`);
  await pool.end();
});

describe("hq_ops_ro", () => {
  it("role attributes: login, no bypassrls/super, 3 connections, 5s statement_timeout", async () => {
    const r = await sql(
      `select rolcanlogin, rolbypassrls, rolsuper, rolinherit, rolconnlimit, rolconfig from pg_roles where rolname = 'hq_ops_ro'`
    );
    expect(r.rows[0]).toEqual({
      rolcanlogin: true,
      rolbypassrls: false,
      rolsuper: false,
      rolinherit: false,
      rolconnlimit: 3,
      rolconfig: ["statement_timeout=5s"],
    });
    const c = await asRole();
    expect((await c.query("show statement_timeout")).rows[0].statement_timeout).toBe("5s");
  });

  it("reads all four ops views; the tenant list matches data.clients", async () => {
    const c = await asRole();
    for (const v of VIEWS)
      expect((await c.query(`select 1 from ops.${v} limit 1`)).rowCount, v).toBeGreaterThanOrEqual(
        0
      );
    const n = (await c.query("select count(*)::int n from ops.clients")).rows[0].n;
    expect(n).toBe((await sql("select count(*)::int n from data.clients")).rows[0].n);
  });

  it("is denied data, api and public tables; cannot write or create", async () => {
    const c = await asRole();
    await expect(c.query("select 1 from data.clients")).rejects.toThrow(/permission denied/);
    await expect(c.query("select 1 from data.source_tokens")).rejects.toThrow(/permission denied/);
    await expect(c.query("select 1 from api.connector_health_v1")).rejects.toThrow(
      /permission denied/
    );
    await expect(c.query("update ops.clients set name = name")).rejects.toThrow(
      /permission denied/
    );
    await expect(c.query("create table ops.x (a int)")).rejects.toThrow(/permission denied/);
    await expect(c.query("create table public.x (a int)")).rejects.toThrow(/permission denied/);
    const r = await sql<{ n: string; bad: boolean }>(
      `select n.nspname||'.'||c.relname n,
              has_table_privilege('hq_ops_ro', c.oid, 'select,insert,update,delete') bad
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname in ('data','api','public') and c.relkind in ('r','p','v','m')`
    );
    expect(r.rows.filter((x) => x.bad)).toEqual([]);
    for (const s of ["data", "api"])
      expect(
        (await sql(`select has_schema_privilege('hq_ops_ro', '${s}', 'usage') u`)).rows[0].u,
        s
      ).toBe(false);
    expect(
      (await sql(`select has_schema_privilege('hq_ops_ro', 'public', 'create') u`)).rows[0].u
    ).toBe(false);
  });

  it("privilege matrix: SELECT only on ops.*, nothing on any other schema's relations", async () => {
    const r = await sql<{ n: string; schema: string; sel: boolean; other: boolean; any: boolean }>(
      `select n.nspname||'.'||c.relname n, n.nspname schema,
              has_table_privilege('hq_ops_ro', c.oid, 'select') sel,
              has_table_privilege('hq_ops_ro', c.oid, 'insert,update,delete,truncate,references,trigger') other,
              has_table_privilege('hq_ops_ro', c.oid, 'select,insert,update,delete,truncate,references,trigger') "any"
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r','p','v','m','f')
          and n.nspname not in ('pg_catalog','information_schema','pg_toast')`
    );
    const ops = r.rows.filter((x) => x.schema === "ops");
    expect(ops.map((x) => x.n.slice(4)).sort()).toEqual([...VIEWS].sort());
    for (const x of ops) expect([x.n, x.sel, x.other]).toEqual([x.n, true, false]);
    // data.*, public.*, api.*, auth.*, anything else: no privilege of any kind
    expect(r.rows.filter((x) => x.schema !== "ops" && x.any).map((x) => x.n)).toEqual([]);
    expect(r.rows.some((x) => x.schema === "data")).toBe(true); // the check is not vacuous
  });

  it("no ops column can carry secrets or error text", async () => {
    const cols = await sql<{ table_name: string; column_name: string; data_type: string }>(
      `select table_name, column_name, data_type from information_schema.columns where table_schema = 'ops'`
    );
    expect(new Set(cols.rows.map((c) => c.table_name))).toEqual(new Set(VIEWS));
    for (const c of cols.rows) {
      expect(c.column_name, `${c.table_name}.${c.column_name}`).not.toMatch(
        /attributes|secret|refresh_secret|last_error|^error$|body|token|email/
      );
      expect(c.data_type, `${c.table_name}.${c.column_name}`).not.toBe("jsonb");
      if (/error/.test(c.column_name)) expect(c.data_type).toBe("boolean"); // has_error is a flag, never text
    }
    const owners = await sql(
      `select c.relname, r.rolname, c.reloptions from pg_class c join pg_roles r on r.oid = c.relowner where c.relnamespace = 'ops'::regnamespace`
    );
    for (const o of owners.rows) expect(o).toMatchObject({ rolname: "postgres", reloptions: null });
  });

  it("has_error is a flag: error text never reaches the view", async () => {
    const slug = `ops-${randomUUID().slice(0, 8)}`;
    const id = (
      await sql(`insert into data.clients (slug, name) values ($1, 'Ops Fixture') returning id`, [
        slug,
      ])
    ).rows[0].id;
    try {
      await sql(
        `insert into data.connector_health (client_id, source, status, status_since, last_error) values ($1, 'shopify', 'error', now(), 'SECRET-TEXT')`,
        [id]
      );
      await sql(
        `insert into data.connector_runs (client_id, source, mode, status, finished_at, error) values ($1, 'shopify', 'incremental', 'error', now(), 'SECRET-TEXT')`,
        [id]
      );
      const c = await asRole();
      const h = (await c.query(`select * from ops.connector_health where slug = $1`, [slug])).rows;
      const r = (await c.query(`select * from ops.connector_runs_7d where slug = $1`, [slug])).rows;
      expect(h).toHaveLength(1);
      expect(h[0]).toMatchObject({ source: "shopify", status: "error", has_error: true });
      expect(r[0]).toMatchObject({ ok: false });
      expect(JSON.stringify([h, r])).not.toContain("SECRET-TEXT");
    } finally {
      await sql(`delete from data.clients where id = $1`, [id]); // health + runs cascade
    }
  });

  it("caps connections at 3 and statements at 5s", async () => {
    const held = [await asRole(), await asRole(), await asRole()];
    expect(held).toHaveLength(3);
    await expect(asRole()).rejects.toThrow(/too many connections for role/);
    await expect(held[0].query("select pg_sleep(6)")).rejects.toThrow(/statement timeout/);
  });
});
