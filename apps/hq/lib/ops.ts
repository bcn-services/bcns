/**
 * ops.ts — the platform's metadata-only `ops` views (read through the hq_ops_ro role) plus HQ's own
 * job-run events. Rules that turn them into fires are pure (`opsFiresFrom`) so tests need no DB.
 * HQ never holds a platform DATABASE_URL: only PLATFORM_OPS_URL, whose role can read four views.
 */
import postgres from "postgres";
import { getConfig } from "./env";
import type { Fire } from "./fires";
import type { createSupabaseServer } from "./supabase";

export interface HealthRow {
  slug: string;
  source: string;
  status: string; // ok | stale | auth_failed | error | never_ran
  status_since: string;
  last_run_at: string | null;
  last_success_at: string | null;
  has_error: boolean;
}
export interface PlatformRun {
  slug: string;
  source: string;
  started_at: string;
  ok: boolean;
  duration_ms: number | null;
}
export interface TicketRow {
  id: string;
  slug: string;
  subject: string;
  severity: string; // low | normal | urgent
  status: string;
  created_at: string;
}
export interface TenantRow {
  slug: string;
  name: string;
  status: string;
  created_at: string;
}
/** `failed` names every query that rejected (or "config" when PLATFORM_OPS_URL is unset). */
export interface OpsSnapshot {
  health: HealthRow[];
  runs: PlatformRun[];
  tickets: TicketRow[];
  clients: TenantRow[];
  failed: string[];
}
/** One HQ `events` row with kind = 'run' (written by apps/hq/jobs/run.mjs): detail {ok, ms, error}. */
export interface RunEvent {
  job: string;
  ok: boolean;
  at: string;
  ms: number | null;
  error: string | null;
}

/**
 * Force certificate verification on the platform connection whatever the configured URL says.
 * postgres.js maps the `sslmode` query param to its `ssl` option; `verify-full` checks chain + host.
 * String ops, not `new URL`: the password may hold raw `%` or `#` that URL parsing would mangle.
 */
export function verifyFullUrl(url: string): string {
  const q = url.indexOf("?", url.lastIndexOf("@") + 1);
  // only a `?` after the last `@` starts the query; an earlier one is part of the password
  const base = q < 0 ? url : url.slice(0, q);
  const rest = q < 0 ? [] : url.slice(q + 1).split("&");
  const kept = rest.filter((kv) => kv && !/^sslmode=/i.test(kv));
  return `${base}?${[...kept, "sslmode=verify-full"].join("&")}`;
}

let pool: postgres.Sql | undefined;
function db(): postgres.Sql | null {
  const url = getConfig().platformOpsUrl;
  if (!url) return null;
  // ponytail: one lazy pool per process; the role allows 3 connections, we take at most 2.
  return (pool ??= postgres(verifyFullUrl(url), {
    max: 2,
    prepare: false,
    connect_timeout: 5,
    idle_timeout: 30,
  }));
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));

const noData = (failed: string[]): OpsSnapshot => ({
  health: [],
  runs: [],
  tickets: [],
  clients: [],
  failed,
});

/** Tenant free text reaches the HQ UI and MCP through here, so the subject is capped at 80 chars. */
export function ticketRow(r: Record<string, unknown>): OpsSnapshot["tickets"][number] {
  return {
    id: String(r.id),
    slug: String(r.slug),
    subject: String(r.subject).slice(0, 80),
    severity: String(r.severity),
    status: String(r.status),
    created_at: iso(r.created_at) ?? "",
  };
}

/**
 * Why a query failed, for the log. Supabase's pooler cert chains to Supabase's own root CA, which
 * Node does not ship, so verify-full fails until that CA is trusted: say so (Nate-run step).
 */
export function failureReason(e: unknown): string {
  if (!(e instanceof Error)) return "error";
  const code = (e as { code?: unknown }).code;
  const tls =
    /^(SELF_SIGNED_CERT|DEPTH_ZERO_SELF_SIGNED|UNABLE_TO_(VERIFY_LEAF|GET_ISSUER)|CERT_|ERR_TLS_CERT)/.test(
      typeof code === "string" ? code : ""
    ) || /self[- ]signed|certificate/i.test(e.message);
  return tls
    ? `${e.message} (TLS verification: trust the Supabase root CA on the droplet via NODE_EXTRA_CA_CERTS)`
    : e.message;
}

async function loadSnapshot(): Promise<OpsSnapshot> {
  const q = db();
  if (!q) return noData(["config"]);
  const names = ["health", "runs", "tickets", "clients"] as const;
  const res = await Promise.allSettled([
    q`select slug, source, status, status_since, last_run_at, last_success_at, has_error
        from ops.connector_health order by slug, source`,
    q`select slug, source, started_at, ok, duration_ms::int as duration_ms
        from ops.connector_runs_7d order by started_at desc limit 200`,
    q`select id, slug, subject, severity, status, created_at
        from ops.tickets_open order by created_at desc limit 50`,
    q`select slug, name, status, created_at from ops.clients order by slug`,
  ]);
  const failed: string[] = [];
  const rows = res.map((r, i) => {
    if (r.status === "fulfilled") return [...r.value] as Record<string, unknown>[];
    failed.push(names[i] ?? "query");
    console.error(`[ops] ${names[i] ?? "query"} query failed: ${failureReason(r.reason)}`);
    return [];
  });
  const map = <T>(i: number, f: (r: Record<string, unknown>) => T) => (rows[i] ?? []).map(f);
  return {
    health: map(0, (r) => ({
      slug: String(r.slug),
      source: String(r.source),
      status: String(r.status),
      status_since: iso(r.status_since) ?? "",
      last_run_at: iso(r.last_run_at),
      last_success_at: iso(r.last_success_at),
      has_error: Boolean(r.has_error),
    })),
    runs: map(1, (r) => ({
      slug: String(r.slug),
      source: String(r.source),
      started_at: iso(r.started_at) ?? "",
      ok: Boolean(r.ok),
      duration_ms: r.duration_ms == null ? null : Number(r.duration_ms),
    })),
    tickets: map(2, ticketRow),
    clients: map(3, (r) => ({
      slug: String(r.slug),
      name: String(r.name),
      status: String(r.status),
      created_at: iso(r.created_at) ?? "",
    })),
    failed,
  };
}

const DEADLINE_MS = 5000; // one deadline for the whole snapshot, not per query
const MEMO_MS = 60_000;
let memo: { at: number; snap: Promise<OpsSnapshot> } | undefined;
export const clearOpsMemo = () => {
  memo = undefined;
};

/**
 * The platform snapshot: at most `deadlineMs` (a timeout is the same "ops unavailable" failure as a
 * refused connection), and memoised for 60 s, failures included, so a dead platform costs one wait a
 * minute and the page and getFires() (both call this) share it. `load` is injectable for tests.
 */
export function opsSnapshot({
  deadlineMs = DEADLINE_MS,
  load = loadSnapshot,
} = {}): Promise<OpsSnapshot> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.snap;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<OpsSnapshot>((res) => {
    timer = setTimeout(() => res(noData(["timeout"])), deadlineMs);
  });
  const snap = Promise.race([
    Promise.resolve()
      .then(load)
      .catch((e) => {
        // postgres() throws synchronously on a malformed URL (e.g. a raw % or # in the password).
        // Messages checked: URIError "URI malformed", TypeError "Invalid URL"; neither echoes the URL.
        console.error("[ops] snapshot load failed:", e instanceof Error ? e.message : "error");
        return noData(["query"]);
      }),
    late,
  ]).finally(() => clearTimeout(timer));
  memo = { at: Date.now(), snap };
  return snap;
}

/** HQ job runs since `sinceIso`, newest first. Throws on a query error. */
export async function hqRuns(
  hq: NonNullable<ReturnType<typeof createSupabaseServer>>,
  sinceIso: string,
  limit = 200
): Promise<RunEvent[]> {
  const { data, error } = await hq
    .from("events")
    .select("job, detail, created_at")
    .eq("kind", "run")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const row = r as {
      job: string;
      detail: { ok?: boolean; ms?: number; error?: string } | null;
      created_at: string;
    };
    return {
      job: row.job,
      ok: row.detail?.ok === true,
      at: row.created_at,
      ms: typeof row.detail?.ms === "number" ? row.detail.ms : null,
      error: row.detail?.error ?? null,
    };
  });
}

const BAD_CONNECTOR = new Set(["auth_failed", "error", "stale"]);
const URGENT_TICKET = new Set(["urgent", "high"]);

/** Snapshot + HQ run events -> fires. Pure. */
export function opsFiresFrom(snap: OpsSnapshot, runs: RunEvent[], now: Date): Fire[] {
  const fires: Fire[] = [];
  if (snap.failed.length)
    fires.push({
      key: "ops:unavailable",
      kind: "ops",
      title: "Ops unavailable",
      detail: snap.failed.includes("config")
        ? "PLATFORM_OPS_URL is not set"
        : `platform query failed: ${snap.failed.join(", ")}`,
      href: "/numbers#ops",
      severity: "warn",
    });
  for (const h of snap.health)
    if (BAD_CONNECTOR.has(h.status))
      fires.push({
        key: `ops:connector:${h.slug}:${h.source}`,
        kind: "connector",
        title: `${h.slug} ${h.source}: ${h.status}`,
        detail: `since ${h.status_since.slice(0, 10)}`,
        href: "/numbers#ops",
        severity: h.status === "stale" ? "warn" : "urgent",
      });
  const since = now.getTime() - 24 * 3600_000;
  const failed = runs.filter((r) => !r.ok && new Date(r.at).getTime() >= since);
  for (const job of new Set(failed.map((r) => r.job))) {
    const mine = failed.filter((r) => r.job === job); // newest first
    fires.push({
      key: `ops:job:${job}`,
      kind: "job",
      title: `${job} failed ${mine.length}x in 24h`,
      detail: mine[0]?.error?.slice(0, 160) ?? undefined,
      href: "/numbers#ops",
      severity: "urgent",
    });
  }
  for (const t of snap.tickets)
    if (t.status === "open" && URGENT_TICKET.has(t.severity))
      fires.push({
        key: `ops:ticket:${t.id}`,
        kind: "ticket",
        title: `${t.slug}: ${t.subject}`,
        detail: `${t.severity} ticket opened ${t.created_at.slice(0, 10)}`,
        href: "/numbers#ops",
        severity: "urgent",
      });
  return fires;
}
