/**
 * The one whitelist of client fields a person or Claude may change. The admin-only Edit form
 * (app/(app)/clients/apply.ts) and the MCP tool propose_client (kind 'client', applied by
 * decide_proposal) both go through checkField, so a value that passes one passes the other.
 * Mirrors the proposals_client_shape check in migration 0034; change them together.
 * health is NOT here: it is derived (lib/clients/health.ts), never set by hand.
 */

export const CLIENT_FIELDS = [
  "monthly_rate_cents",
  "billing_source",
  "mercury_customer_id",
  "aliases",
  "repo_url",
  "launch_date",
  "notes",
] as const;
export type ClientField = (typeof CLIENT_FIELDS)[number];

export const BILLING_SOURCES = ["mercury", "stripe", "none"] as const;

export const isClientField = (f: unknown): f is ClientField =>
  typeof f === "string" && (CLIENT_FIELDS as readonly string[]).includes(f);

export const isSlug = (s: unknown): s is string =>
  typeof s === "string" && /^[a-z0-9][a-z0-9-]{0,62}$/.test(s);

export type Checked = { ok: true; value: unknown } | { ok: false; reason: string };
const no = (reason: string): Checked => ({ ok: false, reason });

function realDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Validates one field and returns the value in its stored shape (cents as an integer, aliases as a
 * string[], text trimmed). null clears a text field / the date / the rate; it clears aliases to [].
 * Clearing is for the Edit form; a proposal needs a real new value (decide_proposal).
 */
export function checkField(field: string, raw: unknown): Checked {
  if (!isClientField(field)) return no(`${String(field)} is not an editable client field`);
  switch (field) {
    case "monthly_rate_cents": {
      if (raw === null) return { ok: true, value: null };
      const n = typeof raw === "number" ? raw : NaN;
      if (!Number.isInteger(n) || n < 0 || n > 9_999_999_999)
        return no("monthly_rate_cents must be whole cents, 0 or more");
      return { ok: true, value: n };
    }
    case "billing_source":
      return (BILLING_SOURCES as readonly string[]).includes(raw as string)
        ? { ok: true, value: raw }
        : no(`billing_source must be one of ${BILLING_SOURCES.join(", ")}`);
    case "mercury_customer_id": {
      if (raw === null) return { ok: true, value: null };
      const s = typeof raw === "string" ? raw.trim() : "";
      return /^[A-Za-z0-9_-]{1,100}$/.test(s)
        ? { ok: true, value: s }
        : no("mercury_customer_id must be 1-100 letters, digits, - or _");
    }
    case "aliases": {
      if (!Array.isArray(raw)) return no("aliases must be a list of names");
      const names = raw.map((a) => (typeof a === "string" ? a.trim() : ""));
      if (names.some((a) => !a || a.length > 100)) return no("each alias must be 1-100 characters");
      const uniq = [...new Set(names)];
      if (uniq.length > 20) return no("at most 20 aliases");
      return { ok: true, value: uniq };
    }
    case "repo_url": {
      if (raw === null) return { ok: true, value: null };
      const s = typeof raw === "string" ? raw.trim() : "";
      return /^https:\/\/\S+$/.test(s) && s.length <= 300
        ? { ok: true, value: s }
        : no("repo_url must be an https:// link");
    }
    case "launch_date": {
      if (raw === null) return { ok: true, value: null };
      return typeof raw === "string" && realDate(raw.trim())
        ? { ok: true, value: raw.trim() }
        : no("launch_date must be a real YYYY-MM-DD date");
    }
    case "notes": {
      if (raw === null) return { ok: true, value: null };
      const s = typeof raw === "string" ? raw.trim() : "";
      if (s.length > 2000) return no("notes is at most 2000 characters");
      return { ok: true, value: s || null };
    }
  }
}

/** What the Edit form posts (strings) -> typed values, ready for checkField. "" means clear. */
export function fromForm(
  form: Record<string, FormDataEntryValue>
): Partial<Record<ClientField, unknown>> {
  const out: Partial<Record<ClientField, unknown>> = {};
  const text = (k: string) =>
    typeof form[k] === "string" ? (form[k] as string).trim() : undefined;
  const rate = text("monthly_rate");
  if (rate !== undefined) {
    // dollars in the form, cents stored; "" clears. NaN fails checkField's integer test.
    out.monthly_rate_cents =
      rate === ""
        ? null
        : /^\d{1,8}(\.\d{1,2})?$/.test(rate)
          ? Math.round(Number(rate) * 100)
          : NaN;
  }
  const src = text("billing_source");
  if (src !== undefined) out.billing_source = src;
  for (const k of ["mercury_customer_id", "repo_url", "launch_date", "notes"] as const) {
    const v = text(k);
    if (v !== undefined) out[k] = v === "" ? null : v;
  }
  const al = text("aliases");
  if (al !== undefined)
    out.aliases =
      al === ""
        ? []
        : al
            .split("\n") // one per line: Mercury payer names carry commas ("SUPPLY BROTHERS, LLC")
            .map((a) => a.trim())
            .filter(Boolean);
  return out;
}

/** Same value, same stored shape: used to skip no-op edits. */
export const sameValue = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
