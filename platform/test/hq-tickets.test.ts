// HQ's ticket sync role (migration *_hq_tickets.sql): hq_tickets can execute ops.hq_tickets_pull and
// ops.hq_ticket_resolve and nothing else; ticket bodies and the reply leave the DB only through them.
// A local test-only password is set here and removed after; the real one is Nate's (alter role by
// hand). Synthetic client + ticket, so the shared seed is untouched. Needs the local stack.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { clientWithToken, DB_URL, mintJwt, pool, serviceClient, sql } from "./helpers.js";

const PW = `hq-tickets-test-${randomUUID()}`;
const opened: pg.Client[] = [];
const made: string[] = [];
const users: string[] = [];

async function asRole(): Promise<pg.Client> {
  const u = new URL(DB_URL);
  u.username = "hq_tickets";
  u.password = PW;
  const c = new pg.Client({ connectionString: u.toString() });
  await c.connect();
  opened.push(c);
  return c;
}

async function mkClient() {
  const id = randomUUID();
  made.push(id);
  const slug = `hqt-${id.slice(0, 8)}`;
  await sql(`insert into data.clients (id, slug, name, timezone) values ($1, $2, 'HQ Tickets Fixture', 'UTC')`, [id, slug]);
  return { id, slug };
}

async function mkTicket(client: string, subject = "Sync is stuck", body = "line 1\nline 2") {
  return (
    await sql(`insert into data.tickets (client_id, subject, body, severity) values ($1, $2, $3, 'urgent') returning id`, [client, subject, body])
  ).rows[0].id as string;
}

beforeAll(async () => {
  await sql(`alter role hq_tickets password '${PW}'`);
});
// The role allows 3 connections: every test closes its own.
afterEach(async () => {
  await Promise.all(opened.splice(0).map((c) => c.end().catch(() => {})));
});
afterAll(async () => {
  await sql(`alter role hq_tickets password null`);
  for (const u of users) await serviceClient().auth.admin.deleteUser(u);
  if (made.length) await sql(`delete from data.clients where id = any($1::uuid[])`, [made]); // tickets cascade
  await pool.end();
});

describe("hq_tickets", () => {
  it("role attributes: login, no bypassrls/super, 3 connections, 5s statement_timeout", async () => {
    const r = await sql(
      `select rolcanlogin, rolbypassrls, rolsuper, rolinherit, rolconnlimit, rolconfig from pg_roles where rolname = 'hq_tickets'`
    );
    expect(r.rows[0]).toEqual({
      rolcanlogin: true,
      rolbypassrls: false,
      rolsuper: false,
      rolinherit: false,
      rolconnlimit: 3,
      rolconfig: ["statement_timeout=5s"],
    });
    expect(((await (await asRole()).query("show statement_timeout")).rows[0] as { statement_timeout: string }).statement_timeout).toBe("5s");
  });

  it("pull returns the ticket with its body and the workspace slug", async () => {
    const cl = await mkClient();
    const id = await mkTicket(cl.id);
    const c = await asRole();
    const rows = (await c.query(`select * from ops.hq_tickets_pull() where id = $1`, [id])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, slug: cl.slug, subject: "Sync is stuck", body: "line 1\nline 2", severity: "urgent", status: "open" });
    expect(Object.keys(rows[0]).sort()).toEqual(["body", "created_at", "id", "severity", "slug", "status", "subject", "updated_at"]);
  });

  it("pull keeps an open ticket past 90 days but drops a closed one", async () => {
    const cl = await mkClient();
    const open = await mkTicket(cl.id);
    const closed = await mkTicket(cl.id);
    // The touch trigger resets updated_at on update, so disable it for the backdate.
    await sql(`alter table data.tickets disable trigger touch`);
    try {
      await sql(`update data.tickets set updated_at = now() - interval '91 days' where id = $1`, [open]);
      await sql(`update data.tickets set status = 'closed', updated_at = now() - interval '91 days' where id = $1`, [closed]);
    } finally {
      await sql(`alter table data.tickets enable trigger touch`);
    }
    const c = await asRole();
    expect((await c.query(`select 1 from ops.hq_tickets_pull() where id = $1`, [open])).rowCount).toBe(1);
    expect((await c.query(`select 1 from ops.hq_tickets_pull() where id = $1`, [closed])).rowCount).toBe(0);
  });

  it("resolve sets resolution, resolved_at and status=closed; a second call changes nothing and returns 0", async () => {
    const cl = await mkClient();
    const id = await mkTicket(cl.id);
    const c = await asRole();
    expect((await c.query(`select ops.hq_ticket_resolve($1, 'done text') n`, [id])).rows[0].n).toBe(1);
    const row = (await sql(`select resolution, resolved_at, status from data.tickets where id = $1`, [id])).rows[0];
    expect(row.resolution).toBe("done text");
    expect(row.resolved_at).toBeInstanceOf(Date);
    expect(row.status).toBe("closed");
    expect((await c.query(`select ops.hq_ticket_resolve($1, 'second') n`, [id])).rows[0].n).toBe(0);
    expect((await sql(`select resolution from data.tickets where id = $1`, [id])).rows[0].resolution).toBe("done text");
    expect((await c.query(`select ops.hq_ticket_resolve($1, 'x') n`, [randomUUID()])).rows[0].n).toBe(0);
  });

  it("an empty reply closes without a resolution; one over 4000 characters is refused", async () => {
    const cl = await mkClient();
    const [a, b] = [await mkTicket(cl.id), await mkTicket(cl.id)];
    const c = await asRole();
    expect((await c.query(`select ops.hq_ticket_resolve($1, '') n`, [a])).rows[0].n).toBe(1);
    expect((await sql(`select resolution, status from data.tickets where id = $1`, [a])).rows[0]).toEqual({ resolution: null, status: "closed" });
    await expect(c.query(`select ops.hq_ticket_resolve($1, $2)`, [b, "x".repeat(4001)])).rejects.toThrow(/check constraint/);
    expect((await sql(`select status from data.tickets where id = $1`, [b])).rows[0].status).toBe("open");
  });

  it("is denied data.tickets, ops.tickets_open and writes; may execute exactly the two functions", async () => {
    const c = await asRole();
    await expect(c.query("select 1 from data.tickets")).rejects.toThrow(/permission denied/);
    await expect(c.query("select 1 from data.clients")).rejects.toThrow(/permission denied/);
    await expect(c.query("select 1 from ops.tickets_open")).rejects.toThrow(/permission denied/);
    await expect(c.query("select 1 from ops.clients")).rejects.toThrow(/permission denied/);
    await expect(c.query("select 1 from api.tickets_v1")).rejects.toThrow(/permission denied/);
    await expect(c.query("update data.tickets set status = 'closed'")).rejects.toThrow(/permission denied/);
    await expect(c.query("create table public.x (a int)")).rejects.toThrow(/permission denied/);
    const rel = await sql<{ n: string }>(
      `select n.nspname||'.'||c.relname n
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r','p','v','m','f') and n.nspname not in ('pg_catalog','information_schema','pg_toast')
          and has_table_privilege('hq_tickets', c.oid, 'select,insert,update,delete,truncate,references,trigger')`
    );
    // Extension relations the image grants to PUBLIC are not ours (see hq-ops-ro.test.ts); anything else fails.
    expect(rel.rows.map((x) => x.n).filter((n) => !/^(extensions|net)\./.test(n))).toEqual([]);
    const fn = await sql<{ f: string }>(
      `select p.oid::regprocedure::text f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('ops','api','data','public') and has_function_privilege('hq_tickets', p.oid, 'execute')`
    );
    expect(fn.rows.map((x) => x.f).sort()).toEqual(["ops.hq_ticket_resolve(uuid,text)", "ops.hq_tickets_pull()"]);
    for (const role of ["anon", "authenticated", "service_role"])
      expect(
        (await sql(`select has_function_privilege($1, 'ops.hq_tickets_pull()', 'execute') a, has_function_privilege($1, 'ops.hq_ticket_resolve(uuid,text)', 'execute') b`, [role])).rows[0],
        role
      ).toEqual({ a: false, b: false });
    expect((await sql(`select has_schema_privilege('hq_tickets', 'data', 'usage') u`)).rows[0].u).toBe(false);
  });

  it("does not widen hq_ops_ro: it cannot execute the functions", async () => {
    for (const f of ["ops.hq_tickets_pull()", "ops.hq_ticket_resolve(uuid,text)"])
      expect((await sql(`select has_function_privilege('hq_ops_ro', $1, 'execute') ok`, [f])).rows[0].ok, f).toBe(false);
  });

  it("api.tickets_v1 exposes resolution and resolved_at to the tenant's member, not to another workspace", async () => {
    const x = await mkClient();
    const y = await mkClient();
    const mk = async (client: string) => {
      const { data, error } = await serviceClient().auth.admin.createUser({
        email: `hqt-${randomUUID().slice(0, 8)}@example.test`,
        password: "password-hqt",
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
      users.push(data.user.id);
      await sql(`insert into data.memberships (user_id, client_id, role) values ($1, $2, 'member')`, [data.user.id, client]);
      return clientWithToken(await mintJwt(data.user.id, { client_id: client }));
    };
    const id = await mkTicket(x.id);
    const c = await asRole();
    await c.query(`select ops.hq_ticket_resolve($1, 'Fixed on our side.')`, [id]);
    const own = await (await mk(x.id)).from("tickets_v1").select("id,status,resolution,resolved_at");
    expect(own.error).toBeNull();
    expect(own.data).toHaveLength(1);
    expect(own.data?.[0]).toMatchObject({ id, status: "closed", resolution: "Fixed on our side." });
    expect(typeof own.data?.[0].resolved_at).toBe("string");
    expect((await (await mk(y.id)).from("tickets_v1").select("id")).data).toEqual([]);
  });
});
