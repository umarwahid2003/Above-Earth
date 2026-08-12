import type { SatelliteCategory } from "@/data/tles";

/** Which satellite browser the user is browsing: the curated 123 or all active. */
export type CatalogMode = "explore" | "full";

/**
 * A single orbital element record. `id`/`name`/`category`/`noradId` are the
 * curated catalog identity; `line1`/`line2` are the current TLE elements
 * (checked-in catalog or fresh CelesTrak data).
 */
export type SatelliteRecord = {
  id: string;
  name: string;
  category: SatelliteCategory;
  noradId: number;
  line1: string;
  line2: string;
};

/** Object-type classification used by Full Catalog mode (CelesTrak SATCAT). */
export type CatalogObjectType =
  | "active"
  | "rocketBody"
  | "debris"
  | "unknown";

/**
 * A single Full Catalog object. `id` is stable (`cat-<noradId>`) so selection
 * survives a reload. Elements come from the server-side CelesTrak provider.
 */
export type CatalogRecord = {
  id: string;
  name: string;
  noradId: number;
  objectType: CatalogObjectType;
  line1: string;
  line2: string;
};