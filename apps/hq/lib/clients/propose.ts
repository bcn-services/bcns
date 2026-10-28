/**
 * propose.ts — files a pending `client` proposal (the MCP tool propose_client). Same row shape as
 * lib/tasks.ts propose(); written here because that function's PROPOSAL_KINDS list is another lane's
 * file. `old` and `via` are set by proposals_server_fields (0034) from the live column and the
 * X-HQ-Via header; the read below is only the no-op guard. Deciding is decide_proposal(), a human click.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkField, isSlug, sameValue, type ClientField } from "./fields";

export async function proposeClient(
  sb: SupabaseClient,
  actor: string,
  via: "ui" | "mcp",
  p: { slug: string; field: string; value: unknown; reason?: string }
): Promise<{ id: string; field: ClientField; old: unknown; new: unknown }> {
  if (!isSlug(p.slug)) throw new Error("bad client slug");
  const c = checkField(p.field, p.value);
  if (!c.ok) throw new Error(c.reason);
  if (c.value === null) throw new Error("a proposal needs a new value, not a clear");
  const field = p.field as ClientField;

  const cur = await sb.from("clients").select(field).eq("slug", p.slug).single();
  if (cur.error || !cur.data) throw new Error(`no client ${p.slug}`);
  const old = (cur.data as unknown as Record<string, unknown>)[field] ?? null;
  if (sameValue(old, c.value)) throw new Error(`${field} is already that value`);

  const ins = await sb
    .from("proposals")
    .insert({
      kind: "client",
      target_id: p.slug,
      field,
      new: c.value,
      reason: p.reason?.trim() || null,
      status: "pending",
      created_by: actor,
      via,
    })
    .select()
    .single();
  if (ins.error || !ins.data)
    throw new Error(`proposals insert: ${ins.error?.message ?? "no row"}`);
  const id = (ins.data as { id: string }).id;
  const ev = await sb.from("events").insert({
    job: "hq",
    kind: "proposal.created",
    detail: { proposal_id: id, kind: "client" },
    actor,
    via,
  });
  if (ev.error)
    console.error(`[clients] proposal ${id} filed but its event failed: ${ev.error.message}`);
  return { id, field, old, new: c.value };
}
