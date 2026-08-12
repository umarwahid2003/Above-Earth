import type { SatelliteCategory } from "@/data/tles";
import type { SatelliteRecord } from "@/lib/types";

const MU = 398600.4418;
export const EARTH_RADIUS_KM = 6371;

/**
 * Anything with TLE elements can be parsed into an orbit snapshot — the
 * curated Explore records or raw Full Catalog records alike. `category` is
 * optional because Full Catalog records carry an object type instead.
 */
export type OrbitInput = {
  id: string;
  name: string;
  noradId: number;
  line1: string;
  line2: string;
  category?: SatelliteCategory;
};

export type OrbitSnapshot = {
  id: string;
  name: string;
  category: SatelliteCategory | undefined;
  noradId: number;
  inclinationDeg: number;
  raanDeg: number;
  eccentricity: number;
  argPerigeeDeg: number;
  meanMotionRevPerDay: number;
  semiMajorAxisKm: number;
  perigeeKm: number;
  apogeeKm: number;
  meanAltitudeKm: number;
  periodMin: number;
  velocityKmS: number;
  orbitType: string;
  epoch: Date;
  epochLabel: string;
  flyRangeM: number;
};

/** Parse orbital facts from a TLE record using the standard fixed field columns. */
export function parseOrbit(record: OrbitInput): OrbitSnapshot {
  const epochYear = Number(record.line1.slice(18, 20)) + 2000;
  const epochDay = Number(record.line1.slice(20, 32));
  const epochMs = Date.UTC(epochYear, 0, 1) + (epochDay - 1) * 86_400_000;

  const inclinationDeg = Number(record.line2.slice(8, 16));
  const raanDeg = Number(record.line2.slice(17, 25));
  const eccField = record.line2.slice(26, 33).replace(/ /g, "0");
  const eccentricity = Number(`0.${eccField}`);
  const argPerigeeDeg = Number(record.line2.slice(34, 42));
  const meanMotionRevPerDay = Number(record.line2.slice(52, 63));

  const periodSec = 86_400 / meanMotionRevPerDay;
  const semiMajorAxisKm = Math.cbrt(
    MU * (periodSec / (2 * Math.PI)) ** 2
  );
  const perigeeKm = semiMajorAxisKm * (1 - eccentricity) - EARTH_RADIUS_KM;
  const apogeeKm = semiMajorAxisKm * (1 + eccentricity) - EARTH_RADIUS_KM;
  const meanAltitudeKm = semiMajorAxisKm - EARTH_RADIUS_KM;
  const velocityKmS = Math.sqrt(MU / semiMajorAxisKm);

  let orbitType: string;
  if (eccentricity > 0.3 && apogeeKm > 20_000) {
    orbitType = "HEO";
  } else if (meanAltitudeKm < 2000) {
    orbitType =
      inclinationDeg >= 96 && inclinationDeg <= 101
        ? "LEO (Sun-synchronous)"
        : "LEO";
  } else if (meanAltitudeKm < 35786) {
    orbitType = "MEO";
  } else if (inclinationDeg < 10) {
    orbitType = "GEO";
  } else {
    orbitType = "GSO";
  }

  const epoch = new Date(epochMs);
  const epochLabel = epoch
    .toISOString()
    .replace("T", " ")
    .slice(0, 19) + "Z";

  return {
    id: record.id,
    name: record.name,
    category: record.category,
    noradId: record.noradId,
    inclinationDeg,
    raanDeg,
    eccentricity,
    argPerigeeDeg,
    meanMotionRevPerDay,
    semiMajorAxisKm,
    perigeeKm,
    apogeeKm,
    meanAltitudeKm,
    periodMin: 1440 / meanMotionRevPerDay,
    velocityKmS,
    orbitType,
    epoch,
    epochLabel,
    flyRangeM: Math.max(220_000, meanAltitudeKm * 1000 * 2.2),
  };
}

const snapshots = new Map<string, OrbitSnapshot>();

export function buildOrbitSnapshots(records: readonly SatelliteRecord[]) {
  const map = snapshots;
  map.clear();
  for (const record of records) {
    try {
      map.set(record.id, parseOrbit(record));
    } catch {
      // Skip unparseable records; callers fall back to "Unavailable".
    }
  }
  return map;
}

export function formatAltitude(value: number) {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })} km`;
}

export function formatVelocity(value: number) {
  return `${value.toFixed(2)} km/s`;
}

export function formatVelocityKmh(value: number) {
  return `${Math.round(value * 3600).toLocaleString("en-US")} km/h`;
}

export function formatDegrees(value: number) {
  return `${value.toFixed(2)}°`;
}

export function formatPeriod(value: number) {
  if (value >= 60) {
    const h = Math.floor(value / 60);
    const m = Math.round(value % 60);
    return `${h}h ${m}m`;
  }
  return `${value.toFixed(1)} min`;
}