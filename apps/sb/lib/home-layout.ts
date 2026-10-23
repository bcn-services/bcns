/**
 * home-layout.ts — the home page's panel layout: the default 12-column slots,
 * the merge of a saved layout onto the panels that exist today, and the
 * read/write against the workspace row (data.clients.home_layout, read through
 * client_v1, written only by api.set_home_layout as the signed-in user).
 *
 * Saved shape: {"v":1,"items":[{"i":"<panel id>","x":0,"y":0,"w":4,"h":9}]}.
 * null = never customised = the default. Anything unreadable also falls back to
 * the default, so a bad row can never blank the home page.
 * Covered by tests/home-layout.test.mjs.
 */

import type { DataClient } from "@bcn-services/data-client";

export const COLS = 12;
export const ROW_H = 24;
export const GAP = 16;
/**
 * The 12-column grid (and Edit layout) exists from this viewport width up. Below
 * it the home is the reflowed default (3-column metrics / 2-column panels from
 * 768px, one column under that), ignoring any saved layout. 1101 = the page's
 * old `max-width: 1100px` breakpoint; globals.css repeats these numbers.
 */
export const GRID_MIN_PX = 1101;
/** Sanity ceiling on a saved height (rows), so a hand-edited row cannot make a mile-long panel. */
export const MAX_H = 60;

export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

const metric = (i: string, n: number): LayoutItem => ({ i, x: n * 2, y: 0, w: 2, h: 4, minW: 2, minH: 3 });

/** Today's page as slots: six metric cards, Shopify / Meta / Financial, then the four lower panels. Array order = mobile order. */
export const DEFAULT_ITEMS: readonly LayoutItem[] = [
  metric("m-revenue", 0),
  metric("m-orders", 1),
  metric("m-conversion", 2),
  metric("m-roas", 3),
  metric("m-aov", 4),
  metric("m-inventory", 5),
  { i: "shopify", x: 0, y: 4, w: 4, h: 9, minW: 3, minH: 5 },
  { i: "meta", x: 4, y: 4, w: 4, h: 9, minW: 3, minH: 5 },
  { i: "finance", x: 8, y: 4, w: 4, h: 9, minW: 3, minH: 5 },
  { i: "meet", x: 0, y: 13, w: 3, h: 12, minW: 3, minH: 6 },
  { i: "monday", x: 3, y: 13, w: 3, h: 12, minW: 3, minH: 6 },
  { i: "library", x: 6, y: 13, w: 3, h: 12, minW: 3, minH: 6 },
  { i: "activity", x: 9, y: 13, w: 3, h: 12, minW: 3, minH: 6 },
];

export const PANEL_IDS: readonly string[] = DEFAULT_ITEMS.map((d) => d.i);

export function defaultLayout(ids: readonly string[] = PANEL_IDS): LayoutItem[] {
  return DEFAULT_ITEMS.filter((d) => ids.includes(d.i)).map((d) => ({ ...d }));
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** One saved item against its panel's default; null when it names no known panel or is not integers. */
function sanitizeItem(raw: unknown, ids: readonly string[]): LayoutItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const base = DEFAULT_ITEMS.find((d) => d.i === r.i);
  if (!base || !ids.includes(base.i) || !isInt(r.x) || !isInt(r.y) || !isInt(r.w) || !isInt(r.h)) return null;
  const minW = base.minW ?? 1;
  const minH = base.minH ?? 1;
  const w = clamp(r.w, minW, COLS);
  return { ...base, x: clamp(r.x, 0, COLS - w), y: Math.max(r.y, 0), w, h: clamp(r.h, minH, MAX_H) };
}

/**
 * The layout to render: saved items for panels that exist, default slots for
 * the rest. A saved id with no panel is dropped; a panel the save never knew
 * (added since) lands in its default columns, below whatever it would overlap.
 * Unreadable input yields the default.
 */
export function mergeLayout(saved: unknown, ids: readonly string[] = PANEL_IDS): LayoutItem[] {
  const rawItems = saved && typeof saved === "object" && (saved as { v?: unknown }).v === 1 ? (saved as { items?: unknown }).items : null;
  if (!Array.isArray(rawItems)) return defaultLayout(ids);

  const placed: LayoutItem[] = [];
  for (const raw of rawItems) {
    const item = sanitizeItem(raw, ids);
    if (item && !placed.some((p) => p.i === item.i)) placed.push(item);
  }
  if (!placed.length) return defaultLayout(ids);

  for (const d of defaultLayout(ids)) {
    if (placed.some((p) => p.i === d.i)) continue;
    const below = placed.filter((p) => p.x < d.x + d.w && d.x < p.x + p.w).reduce((m, p) => Math.max(m, p.y + p.h), 0);
    placed.push({ ...d, y: below });
  }
  return placed;
}

/** The persisted shape of a layout: ids and integers only, no min/max hints. */
export function toSaved(items: readonly LayoutItem[]) {
  return { v: 1 as const, items: items.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })) };
}

/** What Done persists: null (reset) when the layout equals the default, else the sanitized layout. */
export function layoutToSave(items: readonly LayoutItem[]): ReturnType<typeof toSaved> | null {
  const clean = mergeLayout(toSaved(items));
  const def = defaultLayout();
  const same = clean.length === def.length && def.every((d) => clean.some((c) => c.i === d.i && c.x === d.x && c.y === d.y && c.w === d.w && c.h === d.h));
  return same ? null : toSaved(clean);
}

/** Saved layout for this workspace; null on no row, no column yet, or any failure (the page then shows the default). */
export async function loadHomeLayout(client: DataClient): Promise<unknown> {
  try {
    const { data, error } = await client.views.client_v1("home_layout").single();
    if (error) return null;
    return (data as { home_layout?: unknown } | null)?.home_layout ?? null;
  } catch (err) {
    console.error("home: layout read failed", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Persist a layout (null resets). Whatever the browser sent is re-sanitized
 * here; the RPC checks membership and derives the client. False = nothing saved.
 */
export async function saveHomeLayout(client: DataClient | null, layout: unknown): Promise<boolean> {
  if (!client) return false;
  // Not null and not the saved shape: refuse, rather than let mergeLayout's default fallback quietly reset.
  if (layout !== null && !(layout && typeof layout === "object" && (layout as { v?: unknown }).v === 1 && Array.isArray((layout as { items?: unknown }).items))) return false;
  const payload = layout === null ? null : layoutToSave(mergeLayout(layout));
  try {
    await client.rpc.set_home_layout({ p_layout: payload });
    return true;
  } catch (err) {
    console.error("home: layout save failed", err instanceof Error ? err.message : err);
    return false;
  }
}
