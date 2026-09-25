/**
 * data-format.ts — pure helpers behind the /data table and the CSV export:
 * money, cell formatting, request-param validation, search escaping, CSV quoting.
 * No Supabase, no env, no clock.
 */

import { formatBytes } from "./sources";
import type { Column } from "./data-views";

/* ------------------------------------------------------------------ money */

/** Intl.NumberFormat construction is slow; a 1000-row export would build one per cell. Null = invalid code. */
const currencyFormats = new Map<string, Intl.NumberFormat | null>();
function currencyFormat(currency: string): Intl.NumberFormat | null {
  let f = currencyFormats.get(currency);
  if (f === undefined) {
    try {
      f = new Intl.NumberFormat("en-US", { style: "currency", currency });
    } catch {
      f = null;
    }
    currencyFormats.set(currency, f);
  }
  return f;
}

/** Fraction digits the currency uses (USD 2, JPY 0, KWD 3). Unknown or missing code: 2. */
export function currencyDigits(currency: unknown): number {
  if (typeof currency !== "string" || !currency) return 2;
  return currencyFormat(currency)?.resolvedOptions().maximumFractionDigits ?? 2;
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** `1999` + USD -> "19.99"; JPY 1999 -> "1999". null when the amount is missing or not a number. */
export function moneyMajorString(minor: unknown, currency: unknown): string | null {
  const n = finite(minor);
  if (n === null) return null;
  const digits = currencyDigits(currency);
  return (n / 10 ** digits).toFixed(digits);
}

/** "$19.99", "€19.99", "¥1,999". Empty string when the amount is missing or not a number. */
export function formatMoney(minor: unknown, currency: unknown): string {
  const n = finite(minor);
  if (n === null) return "";
  const major = n / 10 ** currencyDigits(currency);
  if (typeof currency === "string" && currency) {
    const f = currencyFormat(currency);
    return f ? f.format(major) : `${major.toFixed(2)} ${currency}`;
  }
  return major.toFixed(2);
}

/* ------------------------------------------------------------------ cells */

export function formatNumber(value: unknown): string {
  const n = finite(value);
  return n === null ? "" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(n);
}

/** `YYYY-MM-DD HH:MM` in UTC, matching the Sources page. Unparseable input comes back as-is. */
export function formatDateTime(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? value : at.toISOString().replace("T", " ").slice(0, 16);
}

function formatDate(value: unknown): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : formatDateTime(value);
}

function formatText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Pretty JSON for the collapsed Details cell. Empty for null / empty objects. */
export function detailsText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && Object.keys(value as object).length === 0) return "";
  return JSON.stringify(value, null, 2);
}

/** Only ever link out to http(s): a stored `javascript:` URL must not become an href. */
export function safeHref(value: unknown): string | null {
  return typeof value === "string" && /^https?:\/\//i.test(value) ? value : null;
}

/** Display string for every column type except `link` and `details`, which the table renders itself. */
export function formatCell(col: Column, row: Record<string, unknown>): string {
  const value = row[col.key];
  switch (col.type) {
    case "money":
      return formatMoney(value, col.currencyKey ? row[col.currencyKey] : undefined);
    case "number":
      return formatNumber(value);
    case "date":
      return formatDate(value);
    case "datetime":
      return formatDateTime(value);
    case "bytes":
      return finite(value) === null ? "" : formatBytes(finite(value));
    case "details":
      return detailsText(value);
    default:
      return formatText(value);
  }
}

/* ------------------------------------------------------------ request params */

/** Strict `YYYY-MM-DD` that is a real calendar day in 1900..2100. Anything else is null. */
export function parseIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  if (year < 1900 || year > 2100) return null;
  const at = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(at.getTime()) && at.toISOString().slice(0, 10) === value ? value : null;
}

export function addDays(isoDay: string, days: number): string {
  const at = new Date(`${isoDay}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

export const SEARCH_MAX = 100;

/** Trim, cap, drop control characters. `*` goes too: PostgREST reads it as a `%` wildcard inside ilike. */
export function cleanSearch(value: unknown): string {
  if (typeof value !== "string") return "";
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  return value.replace(/[\u0000-\u001f\u007f*]/g, " ").trim().slice(0, SEARCH_MAX).trim();
}

/**
 * The value for a PostgREST `.or()` string: `col.ilike."%term%",col2.ilike."%term%"`.
 * Two layers of escaping, both needed to stop a typed `,` or `)` from starting a new
 * filter clause: the LIKE layer (`\` `%` `_` are literals, not wildcards) and the
 * PostgREST layer (the whole pattern is double-quoted, so `,()` are inert; `\` and `"`
 * are backslash-escaped inside the quotes). Column names come from config only.
 */
export function searchFilter(term: string, columns: readonly string[]): string | null {
  const q = cleanSearch(term);
  if (!q || columns.length === 0) return null;
  const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const quoted = `"${like.replace(/[\\"]/g, "\\$&")}"`;
  return columns.map((c) => `${c}.ilike.${quoted}`).join(",");
}

/* --------------------------------------------------------------------- csv */

/** Prefix a `'` so a spreadsheet does not run a text cell as a formula. */
export function guardFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** RFC 4180: quote when the field has a comma, quote, CR or LF; double embedded quotes. */
export function csvField(text: string): string {
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One CSV cell. Money is a decimal major-unit string, `details` is JSON, everything else is raw. */
export function csvCell(col: Column, row: Record<string, unknown>): string {
  const value = row[col.key];
  switch (col.type) {
    case "money":
      // Numeric strings ("-12.00") must not get the formula guard.
      return csvField(moneyMajorString(value, col.currencyKey ? row[col.currencyKey] : undefined) ?? "");
    case "number":
    case "bytes":
      return csvField(finite(value) === null ? "" : String(finite(value)));
    case "details":
      return csvField(guardFormula(value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value)));
    default:
      return csvField(guardFormula(typeof value === "string" ? value : formatText(value)));
  }
}
