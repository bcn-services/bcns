/**
 * data-stats.ts — the pinnable header stats on /data: what exists, what is pinned by
 * default, and how a saved choice is read back. Pure: no I/O, no env, no clock.
 *
 * A stat id is `${source}/${key}`. Pins live in a cookie, so the same rule applies to
 * everything that reads one: keep only ids in STAT_IDS, dedupe, cap at MAX_PINS.
 * No `client_id` anywhere; the numbers come from the caller's own RLS-scoped reads.
 */

import { DATA_VIEWS, viewsFor } from "./data-views";
import { formatMoney } from "./data-format";
import type { Last30, Meta30 } from "./data-query";

export const PINS_COOKIE = "data_pins";
export const MAX_PINS = 40;

/** Every id a pin may name. Anything else in a cookie or a form post is dropped. */
export const STAT_IDS: readonly string[] = [...DATA_VIEWS.map((v) => `${v.source}/${v.id}`), "shopify/revenue", "meta/spend"];

export interface Stat {
  id: string;
  source: string;
  label: string;
  value: string;
}

export interface StatInputs {
  /** Rows in the last 30 days, keyed `${source}/${viewId}`; null = that read failed. */
  counts: Record<string, number | null>;
  last30: Last30 | null;
  meta: Meta30 | null;
}

const money = (rows: readonly { currency: string | null; minor: number }[]) =>
  rows.map((r) => formatMoney(r.minor, r.currency)).join(" + ") || "—";

/** Every stat for every connected source, grouped by source in the order given. */
export function buildCatalog(connectedSources: readonly string[], inputs: StatInputs): Stat[] {
  const out: Stat[] = [];
  for (const source of connectedSources) {
    for (const v of viewsFor(source)) {
      const n = inputs.counts[`${source}/${v.id}`];
      out.push({ id: `${source}/${v.id}`, source, label: `${v.label}, 30 days`, value: n == null ? "—" : n.toLocaleString("en-US") });
    }
    if (source === "shopify")
      out.push({ id: "shopify/revenue", source, label: "Revenue, 30 days", value: inputs.last30 ? money(inputs.last30.revenue) : "Unavailable" });
    if (source === "meta")
      out.push({ id: "meta/spend", source, label: "Ad spend, 30 days", value: inputs.meta ? money(inputs.meta.spend) : "Unavailable" });
  }
  return out;
}

export function defaultPins(connectedSources: readonly string[]): string[] {
  return ["shopify/orders", "shopify/revenue", "meta/spend"].filter((id) => connectedSources.includes(id.split("/")[0]!));
}

/** Known ids only, strings only, no repeats, at most MAX_PINS. */
export function cleanPins(ids: readonly unknown[]): string[] {
  const seen = new Set<string>();
  for (const id of ids) if (typeof id === "string" && STAT_IDS.includes(id)) seen.add(id);
  return [...seen].slice(0, MAX_PINS);
}

/** null = no saved choice (use defaults). "none" = saved on purpose as empty. A cookie with no usable id counts as no choice. */
export function parsePins(raw: string | undefined): string[] | null {
  if (raw === undefined) return null;
  if (raw === "none") return [];
  const ids = cleanPins(raw.split(","));
  return ids.length ? ids : null;
}

export function serializePins(ids: readonly string[]): string {
  return ids.length ? ids.join(",") : "none";
}

/** The pins to show: saved (or default) ids that are in today's catalog. Unconnected sources drop out silently. */
export function resolvePins(saved: string[] | null, catalog: readonly Stat[], connectedSources: readonly string[]): string[] {
  return (saved ?? defaultPins(connectedSources)).filter((id) => catalog.some((s) => s.id === id));
}

/** Where the form may send the browser back to: /data, optionally with a query string. Anything else is /data. */
export function sanitizeReturnTo(value: unknown): string {
  return typeof value === "string" && /^\/data(\?[^\s\\]*)?$/.test(value) ? value : "/data";
}
