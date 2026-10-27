import type { createSupabaseServer } from "@/lib/supabase";
import { planUpdate } from "./update";

type Sb = NonNullable<ReturnType<typeof createSupabaseServer>>;

/** Applies the edit form: updates only changed fields, one `events` row per change. Returns the changes written. */
export async function applyClientUpdate(
  sb: Sb,
  userId: string,
  form: Record<string, FormDataEntryValue>
): Promise<{ ok: boolean; changed: number; reason?: string }> {
  const slug = String(form.slug ?? "");
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) return { ok: false, changed: 0, reason: "bad slug" };
  const cur = await sb
    .from("clients")
    .select("health, stage, owner, billing_note")
    .eq("slug", slug)
    .single();
  if (cur.error) return { ok: false, changed: 0, reason: cur.error.message };
  const plan = planUpdate(cur.data, form);
  if (!plan.ok) return { ok: false, changed: 0, reason: plan.reason };
  if (!plan.changes.length) return { ok: true, changed: 0 };

  const upd = await sb
    .from("clients")
    .update({ ...plan.patch, updated_at: new Date().toISOString() })
    .eq("slug", slug);
  if (upd.error) return { ok: false, changed: 0, reason: upd.error.message };
  const ev = await sb.from("events").insert(
    plan.changes.map((c) => ({
      job: "clients",
      kind: "client_update",
      detail: { slug, field: c.field, old: c.old, new: c.new },
      actor: userId,
      via: "ui",
    }))
  );
  if (ev.error) console.error(`[clients] ${slug} updated but events failed: ${ev.error.message}`);
  return { ok: true, changed: plan.changes.length };
}
