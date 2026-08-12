import type { SatelliteCategory } from "@/data/tles";
import type { CatalogRecord, SatelliteRecord } from "@/lib/types";

export type CategoryFilter = SatelliteCategory | "All";
export type OrbitPathMode = "off" | "selected" | "all";
export type ObjectTypeFilter = "active" | "rocketBody" | "debris";

/** Filter a catalog by category chip and free-text query (name only). */
export function filterSatellites(
  list: readonly SatelliteRecord[],
  query: string,
  category: CategoryFilter
): SatelliteRecord[] {
  const q = query.trim().toLowerCase();
  return list.filter((record) => {
    if (category !== "All" && record.category !== category) return false;
    if (q && !record.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

/**
 * Filter the Full Catalog by enabled object types and free-text query. The
 * query matches both name and NORAD id so a catalog of thousands is navigable.
 */
export function filterFullCatalog(
  list: readonly CatalogRecord[],
  query: string,
  enabled: Record<ObjectTypeFilter, boolean>
): CatalogRecord[] {
  const q = query.trim().toLowerCase();
  return list.filter((record) => {
    if (record.objectType === "unknown") return false;
    if (!enabled[record.objectType]) return false;
    if (
      q &&
      !record.name.toLowerCase().includes(q) &&
      !String(record.noradId).includes(q)
    ) {
      return false;
    }
    return true;
  });
}