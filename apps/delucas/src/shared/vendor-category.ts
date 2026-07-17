/**
 * vendor-category.ts — pure vendor→category mapping logic.
 *
 * Shared between the main process (email auto-import, drag-drop suggestion) and
 * the renderer (confirm-card category prefill). Pure functions only — no DB,
 * no electron/node imports — so the renderer may import it.
 */

import type { TransactionCategory } from "./types";

export type VendorMap = Record<string, TransactionCategory>;

const VALID_CATEGORIES = new Set<TransactionCategory>([
  "food",
  "beverage",
  "utilities",
  "rent",
  "labor",
  "other",
]);

/**
 * Parse a raw JSON string into a normalized VendorMap. Keys are lowercased;
 * entries with invalid category values are dropped. Returns {} on any problem
 * (undefined, malformed JSON, non-object).
 */
export function parseVendorMap(raw: string | undefined | null): VendorMap {
  if (raw === undefined || raw === null) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }

  const map: VendorMap = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === "string" && VALID_CATEGORIES.has(value as TransactionCategory)) {
      map[key.toLowerCase()] = value as TransactionCategory;
    }
  }
  return map;
}

/**
 * Look up a vendor string in the map via case-insensitive substring match.
 * First-match-wins (insertion order). Falls back to "other" when no key matches.
 */
export function resolveCategory(vendor: string, map: VendorMap): TransactionCategory {
  const lowerVendor = vendor.toLowerCase();
  for (const [key, category] of Object.entries(map)) {
    if (lowerVendor.includes(key)) {
      return category;
    }
  }
  return "other";
}
