import type { SatelliteCategory } from "@/data/categories";

/** Compact subset of a CCSDS OMM record required by satellite.js SGP4. */
export type OmmElements = {
  OBJECT_NAME: string;
  OBJECT_ID: string;
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  EPHEMERIS_TYPE: 0;
  CLASSIFICATION_TYPE: "U" | "C";
  NORAD_CAT_ID: number;
  ELEMENT_SET_NO: number;
  REV_AT_EPOCH: number;
  BSTAR: number;
  MEAN_MOTION_DOT: number;
  MEAN_MOTION_DDOT: number;
};

export type OrbitalElements = {
  /** Preferred lossless source, including catalog IDs above 99999. */
  omm?: OmmElements;
  /** Legacy fallback for checked-in snapshots created before OMM migration. */
  line1?: string;
  line2?: string;
};

/** Which satellite browser the user is browsing: the curated 123 or all active. */
export type CatalogMode = "explore" | "full";

/**
 * A single orbital element record. `id`/`name`/`category`/`noradId` are the
 * curated catalog identity; `omm` contains current CelesTrak orbital elements.
 */
export type SatelliteRecord = OrbitalElements & {
  id: string;
  name: string;
  category: SatelliteCategory;
  noradId: number;
};

/** Legacy-compatible object classification. Full Catalog currently serves active satellites. */
export type CatalogObjectType =
  | "active"
  | "rocketBody"
  | "debris"
  | "unknown";

/**
 * A single Full Catalog object. `id` is stable (`cat-<noradId>`) so selection
 * survives a reload. Elements come from the server-side CelesTrak provider.
 */
export type CatalogRecord = OrbitalElements & {
  id: string;
  name: string;
  noradId: number;
  objectType: CatalogObjectType;
};
