/**
 * Pure planner for the client Edit form: which whitelisted fields changed, and what to write. No IO.
 * Health is not editable: it is derived from uptime, connectors and payment (lib/clients/health.ts).
 */
import {
  checkField,
  CLIENT_FIELDS,
  fromForm,
  sameValue,
  type ClientField,
} from "@/lib/clients/fields";

export type ClientEditable = Record<ClientField, unknown>;
export type Patch = Partial<ClientEditable>;
export interface Change {
  field: ClientField;
  old: unknown;
  new: unknown;
}

/** Only the fields present in the form are looked at; unchanged ones are dropped. */
export function planUpdate(
  cur: Partial<ClientEditable>,
  form: Record<string, FormDataEntryValue>
): { ok: true; patch: Patch; changes: Change[] } | { ok: false; reason: string } {
  const patch: Patch = {};
  const changes: Change[] = [];
  const wanted = fromForm(form);
  for (const field of CLIENT_FIELDS) {
    if (!(field in wanted)) continue;
    const c = checkField(field, wanted[field]);
    if (!c.ok) return { ok: false, reason: c.reason };
    if (sameValue(cur[field], c.value)) continue;
    patch[field] = c.value;
    changes.push({ field, old: cur[field] ?? null, new: c.value });
  }
  return { ok: true, patch, changes };
}
