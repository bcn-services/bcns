/**
 * vendor-mapping.ts — vendor string → TransactionCategory mapping.
 *
 * Reads the mapping from the settings table (key: "vendor_category_map").
 * Value is a JSON object: { "sysco": "food", "foxon": "beverage", ... }.
 * Keys are matched as case-insensitive substrings of the vendor string.
 * Falls back to "other" if no match.
 *
 * Main process only — reads from SQLite via getSetting.
 */

import type Database from "better-sqlite3";
import type { TransactionCategory } from "../../shared/types";
import { getSetting, setSetting } from "../db/queries";

export const VENDOR_MAP_SETTING_KEY = "vendor_category_map";

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
 * Load the vendor→category map from settings.
 * Returns an empty object if the key is not set or value is malformed JSON.
 */
export function loadVendorMap(db: Database.Database): VendorMap {
  const raw = getSetting(db, VENDOR_MAP_SETTING_KEY);
  if (raw === undefined) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("[vendor-mapping] vendor_category_map is not valid JSON — using empty map");
    return {};
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    console.warn("[vendor-mapping] vendor_category_map must be a plain object — using empty map");
    return {};
  }

  // Filter to only entries with valid category values
  const map: VendorMap = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value === "string" && VALID_CATEGORIES.has(value as TransactionCategory)) {
      map[key.toLowerCase()] = value as TransactionCategory;
    }
  }
  return map;
}

/**
 * Save the vendor→category map to settings.
 */
export function saveVendorMap(db: Database.Database, map: VendorMap): void {
  setSetting(db, VENDOR_MAP_SETTING_KEY, JSON.stringify(map));
}

/**
 * Look up a vendor string in the map.
 * Performs case-insensitive substring matching: if any key is a substring of
 * the (lowercased) vendor, the corresponding category is returned.
 *
 * First-match-wins is intentional: the caller controls ordering by the order
 * keys were inserted into the VendorMap object (plain JS object iteration order,
 * i.e. insertion order for string keys per ES2015+). More specific rules should
 * be inserted before broader ones when building the map.
 *
 * Falls back to "other" when no key matches.
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
