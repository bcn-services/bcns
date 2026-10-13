import type { HubSource } from "@/lib/sources";

/** Badge monogram (decoration only). */
export const MONO: Record<HubSource, string> = { shopify: "Sh", meta: "Me", monday: "Mo", meet: "Mt", drive: "Dr", quickbooks: "QB" };
/**
 * The kind of data each source holds. The type filter's chips are generated from this map, and
 * each kind's hue is the `--kind-<slug>` token in globals.css (badge and chip share it).
 */
export const KIND: Record<HubSource, string> = {
  shopify: "Commerce",
  meta: "Advertising",
  monday: "Projects",
  meet: "Meetings",
  drive: "Files",
  quickbooks: "Accounting",
};
export const kindSlug = (kind: string) => kind.toLowerCase();
