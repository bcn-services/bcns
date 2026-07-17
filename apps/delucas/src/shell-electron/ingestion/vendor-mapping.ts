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
import { getSetting, setSetting } from "../db/queries";
import { parseVendorMap, resolveCategory, type VendorMap } from "../../shared/vendor-category";

export const VENDOR_MAP_SETTING_KEY = "vendor_category_map";

// Re-export shared types/functions so existing importers (email source, etc.)
// keep working without change.
export { resolveCategory };
export type { VendorMap };

/**
 * Load the vendor→category map from settings.
 * Returns an empty object if the key is not set or value is malformed JSON.
 */
export function loadVendorMap(db: Database.Database): VendorMap {
  return parseVendorMap(getSetting(db, VENDOR_MAP_SETTING_KEY));
}

/**
 * Save the vendor→category map to settings.
 */
export function saveVendorMap(db: Database.Database, map: VendorMap): void {
  setSetting(db, VENDOR_MAP_SETTING_KEY, JSON.stringify(map));
}
