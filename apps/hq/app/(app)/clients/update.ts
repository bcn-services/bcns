/** Pure validation for the client edit form: what changed, and what to write. No IO. */

export const HEALTHS = ["green", "amber", "red"] as const;

export interface ClientEditable {
  health: string | null;
  stage: string | null;
  owner: string | null;
  billing_note: string | null;
}
export type Patch = Partial<ClientEditable>;
export interface Change {
  field: keyof ClientEditable;
  old: string | null;
  new: string | null;
}

const LIMITS = { stage: 60, owner: 60, billing_note: 500 } as const;

/** Empty string means "clear". Returns only the fields that differ from `cur`. */
export function planUpdate(
  cur: ClientEditable,
  form: Record<string, FormDataEntryValue | null | undefined>
): { ok: true; patch: Patch; changes: Change[] } | { ok: false; reason: string } {
  const patch: Patch = {};
  const changes: Change[] = [];
  const take = (field: keyof ClientEditable, v: string | null) => {
    if ((cur[field] ?? null) !== v) {
      patch[field] = v;
      changes.push({ field, old: cur[field] ?? null, new: v });
    }
  };

  if (form.health != null) {
    const h = String(form.health).trim();
    if (h && !(HEALTHS as readonly string[]).includes(h))
      return { ok: false, reason: "bad health" };
    take("health", h || null);
  }
  for (const f of ["stage", "owner", "billing_note"] as const) {
    const raw = form[f];
    if (raw == null) continue; // field not in the form: leave alone
    const v = String(raw).trim();
    if (v.length > LIMITS[f]) return { ok: false, reason: `${f} is over ${LIMITS[f]} characters` };
    take(f, v || null);
  }
  return { ok: true, patch, changes };
}
