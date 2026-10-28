/**
 * proposals.ts — read side of the approval loop. Deciding is NOT here: the only write path is
 * the decide_proposal() RPC, called from the decideProposal server action.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ProposalView {
  id: string;
  kind: "lead_stage" | "finance" | "client";
  target: string; // business name (lead_stage), "week of <date>" (finance) or "client <slug>"
  field: string;
  old: string;
  next: string;
  reason: string;
  who: string;
  via: string;
  age: string;
  /** Admins only. The decide_proposal RPC enforces it too; this just hides the buttons from staff. */
  canDecide: boolean;
}

/** jsonb old/new -> display text. spend_cents shows as dollars; null = no value yet. */
export function fmtValue(field: string, v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number" && field.endsWith("/spend_cents")) return `$${(v / 100).toFixed(2)}`;
  if (typeof v === "number" && field === "monthly_rate_cents") return `$${(v / 100).toFixed(2)}/mo`;
  return typeof v === "string" ? v : JSON.stringify(v);
}

export function ageLabel(iso: string, now: Date): string {
  const m = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60000));
  if (m < 60) return `${m}m`;
  if (m < 60 * 48) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

/** Claude acts as the connecting human: "Claude (nate)" for MCP writes, else the handle. */
export function whoLabel(handle: string | null, via: string | null): string {
  const h = handle ?? "someone";
  return via === "mcp" ? `Claude (${h})` : h;
}

/** profiles.role = 'admin' via is_admin(). Any error means false: the UI hides, the RPC still decides. */
export async function isAdmin(sb: SupabaseClient): Promise<boolean> {
  try {
    const r = await sb.rpc("is_admin");
    return r.error ? false : r.data === true;
  } catch {
    return false;
  }
}

interface Row {
  id: string;
  kind: ProposalView["kind"];
  target_id: string;
  field: string;
  old: unknown;
  new: unknown;
  reason: string | null;
  created_by: string | null;
  via: string | null;
  created_at: string;
}

export async function listPendingProposals(
  sb: SupabaseClient,
  now: Date = new Date()
): Promise<ProposalView[]> {
  const r = await sb
    .from("proposals")
    .select("id, kind, target_id, field, old, new, reason, created_by, via, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(200);
  if (r.error) throw new Error(`proposals: ${r.error.message}`);
  const rows = (r.data ?? []) as Row[];
  if (!rows.length) return [];
  const bizIds = rows.filter((p) => p.kind === "lead_stage").map((p) => p.target_id);
  const [biz, prof, canDecide] = await Promise.all([
    bizIds.length ? sb.from("businesses").select("id, name").in("id", bizIds) : { data: [] },
    sb.from("profiles").select("id, handle"),
    isAdmin(sb),
  ]);
  const names = new Map(
    ((biz.data ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name])
  );
  const handles = new Map(
    ((prof.data ?? []) as { id: string; handle: string | null }[]).map((p) => [p.id, p.handle])
  );
  return rows.map((p) => ({
    id: p.id,
    kind: p.kind,
    target:
      p.kind === "finance"
        ? `week of ${p.target_id}`
        : p.kind === "client"
          ? `client ${p.target_id}`
          : (names.get(p.target_id) ?? p.target_id),
    field: p.field,
    old: fmtValue(p.field, p.old),
    next: fmtValue(p.field, p.new),
    reason: p.reason ?? "",
    who: whoLabel(handles.get(p.created_by ?? "") ?? null, p.via),
    via: p.via ?? "",
    age: ageLabel(p.created_at, now),
    canDecide,
  }));
}
