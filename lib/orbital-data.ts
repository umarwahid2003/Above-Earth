import { promises as fs } from "node:fs";
import path from "node:path";
import { TLES } from "@/data/tles";
import activeCatalogData from "@/data/active-catalog.json";
import type { OrbitalDataSource } from "@/store/satellites";
import type { CatalogObjectType, CatalogRecord, SatelliteRecord } from "@/lib/types";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_DIR = path.join(process.cwd(), ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "orbital-data.json");
const CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php";
const FETCH_TIMEOUT_MS = 15_000;
const CATALOG_EPOCH = "2026-08-11T12:00:00.000Z";

export const CATALOG_EPOCH_LABEL = "2026-08-11 12:00:00Z";

/**
 * Structured error produced by the Full Catalog provider. `code` is a stable
 * diagnostic key surfaced to the UI and logs; `message` is a safe
 * user-facing string that never leaks internals.
 */
export class FullCatalogError extends Error {
  constructor(
    public readonly code:
      | "FULL_CATALOG_UNREACHABLE"
      | "FULL_CATALOG_EMPTY"
      | "FULL_CATALOG_INVALID",
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "FullCatalogError";
  }
}

type OrbitalDataResponse = {
  source: OrbitalDataSource;
  lastUpdated: string;
  isStale: boolean;
  satelliteCount: number;
  updatedCount: number;
  satellites: SatelliteRecord[];
};

type CacheEntry = {
  fetchedAt: number;
  satellites: SatelliteRecord[];
};

export type FullCatalogResponse = {
  source: "celestrak" | "cache";
  lastUpdated: string;
  isStale: boolean;
  count: number;
  satellites: CatalogRecord[];
};

type FullCatalogCacheEntry = {
  fetchedAt: number;
  satellites: CatalogRecord[];
};

let memoryCache: CacheEntry | null = null;

let fullMemoryCache: FullCatalogCacheEntry | null = null;

async function readCacheFile(): Promise<CacheEntry | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw) as CacheEntry;
    if (
      typeof parsed.fetchedAt !== "number" ||
      !Array.isArray(parsed.satellites)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function readCache(): Promise<CacheEntry | null> {
  if (memoryCache) return memoryCache;
  const entry = await readCacheFile();
  if (entry) memoryCache = entry;
  return entry;
}

async function writeCache(entry: CacheEntry): Promise<void> {
  memoryCache = entry;
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(entry), "utf8");
  } catch {
    // Cache persistence is best-effort; the in-memory entry still applies.
  }
}

const FULL_CACHE_FILE = path.join(CACHE_DIR, "full-catalog.json");

async function readFullCacheFile(): Promise<FullCatalogCacheEntry | null> {
  try {
    const raw = await fs.readFile(FULL_CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw) as FullCatalogCacheEntry;
    if (
      typeof parsed.fetchedAt !== "number" ||
      !Array.isArray(parsed.satellites)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function readFullCache(): Promise<FullCatalogCacheEntry | null> {
  if (fullMemoryCache) return fullMemoryCache;
  const entry = await readFullCacheFile();
  if (entry) fullMemoryCache = entry;
  return entry;
}

async function writeFullCache(entry: FullCatalogCacheEntry): Promise<void> {
  fullMemoryCache = entry;
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(FULL_CACHE_FILE, JSON.stringify(entry), "utf8");
  } catch {
    // Cache persistence is best-effort; the in-memory entry still applies.
  }
}

const RAW_CACHE_FILE = path.join(CACHE_DIR, "celestrak-raw.txt");
const RAW_META_FILE = path.join(CACHE_DIR, "celestrak-meta.json");

async function readRawCache(): Promise<Map<number, string[]> | null> {
  try {
    const metaRaw = await fs.readFile(RAW_META_FILE, "utf8");
    const meta = JSON.parse(metaRaw);
    if (Date.now() - meta.fetchedAt >= CACHE_TTL_MS) return null;
    const text = await fs.readFile(RAW_CACHE_FILE, "utf8");
    return parseTleText(text);
  } catch {
    return null;
  }
}

async function writeRawCache(text: string): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(RAW_CACHE_FILE, text, "utf8");
    await fs.writeFile(RAW_META_FILE, JSON.stringify({ fetchedAt: Date.now() }), "utf8");
  } catch {}
}

async function fetchCelestrak(): Promise<Map<number, string[]>> {
  const url = `${CELESTRAK_URL}?GROUP=active&FORMAT=tle`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "above-earth/0.1 (interactive satellite globe)",
        Accept: "text/plain,*/*",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`CelesTrak responded ${res.status}`);
    const text = await res.text();
    await writeRawCache(text);
    return parseTleText(text);
  } finally {
    clearTimeout(timer);
  }
}


/** CelesTrak GP TLE text is a sequence of 3-line records: name, line1, line2. */
function parseTleText(text: string): Map<number, string[]> {
  const lines = text.replace(/\r/g, "").split("\n").map((line) => line.trimEnd());
  const result = new Map<number, string[]>();
  for (let i = 0; i < lines.length; i += 3) {
    const name = lines[i]?.trim() ?? "";
    const line1 = lines[i + 1] ?? "";
    const line2 = lines[i + 2] ?? "";
    if (!/^1 /.test(line1) || !/^2 /.test(line2)) continue;
    const noradId = Number(line2.slice(2, 7));
    if (!Number.isInteger(noradId) || noradId <= 0) continue;
    result.set(noradId, [name, line1, line2]);
  }
  return result;
}

type ActiveTleEntry = {
  fetchedAt: number;
  tles: Map<number, string[]>;
};

let activeMemory: ActiveTleEntry | null = null;
let activeInflight: Promise<Map<number, string[]>> | null = null;

/**
 * Return the raw CelesTrak `GROUP=active` TLE map, shared by the Explore
 * pipeline and the Full Catalog. CelesTrak enforces one download per update
 * window for this group, so a single in-flight fetch serves every caller.
 */
async function getActiveTles(): Promise<Map<number, string[]>> {
  const now = Date.now();
  if (activeMemory && now - activeMemory.fetchedAt < CACHE_TTL_MS) {
    return activeMemory.tles;
  }
  
  const rawCache = await readRawCache();
  if (rawCache) {
    activeMemory = { fetchedAt: now, tles: rawCache };
    return rawCache;
  }

  if (activeInflight) return activeInflight;
  activeInflight = (async () => {
    const tles = await fetchCelestrak();
    activeMemory = { fetchedAt: Date.now(), tles };
    return tles;
  })().finally(() => {
    activeInflight = null;
  });
  return activeInflight;
}

let inflight: Promise<OrbitalDataResponse> | null = null;

/** Return current orbital elements, preferring fresh CelesTrak data. */
export async function getSatellites(): Promise<OrbitalDataResponse> {
  if (inflight) return inflight;
  inflight = loadSatellites().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function loadSatellites(): Promise<OrbitalDataResponse> {
  const cached = await readCache();
  const now = Date.now();

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return {
      source: "cache",
      lastUpdated: new Date(cached.fetchedAt).toISOString(),
      isStale: false,
      satelliteCount: cached.satellites.length,
      updatedCount: countUpdated(cached.satellites),
      satellites: cached.satellites,
    };
  }

  try {
    const fetched = await fetchFromCelestrak();
    const entry: CacheEntry = { fetchedAt: now, satellites: fetched };
    await writeCache(entry);
    return {
      source: "celestrak",
      lastUpdated: new Date(now).toISOString(),
      isStale: false,
      satelliteCount: fetched.length,
      updatedCount: countUpdated(fetched),
      satellites: fetched,
    };
  } catch {
    if (cached) {
      return {
        source: "cache",
        lastUpdated: new Date(cached.fetchedAt).toISOString(),
        isStale: true,
        satelliteCount: cached.satellites.length,
        updatedCount: countUpdated(cached.satellites),
        satellites: cached.satellites,
      };
    }
    return catalogResponse();
  }
}

async function fetchFromCelestrak(): Promise<SatelliteRecord[]> {
  const live = await getActiveTles();

  const merged: SatelliteRecord[] = [];
  for (const tle of TLES) {
    const fresh = live.get(tle.noradId);
    merged.push(
      fresh
        ? {
            id: tle.id,
            name: tle.name,
            category: tle.category,
            noradId: tle.noradId,
            line1: fresh[1],
            line2: fresh[2],
          }
        : {
            id: tle.id,
            name: tle.name,
            category: tle.category,
            noradId: tle.noradId,
            line1: tle.line1,
            line2: tle.line2,
          }
    );
  }
  return merged;
}

function catalogResponse(): OrbitalDataResponse {
  const satellites: SatelliteRecord[] = TLES.map((tle) => ({
    id: tle.id,
    name: tle.name,
    category: tle.category,
    noradId: tle.noradId,
    line1: tle.line1,
    line2: tle.line2,
  }));
  return {
    source: "catalog",
    lastUpdated: CATALOG_EPOCH,
    isStale: true,
    satelliteCount: satellites.length,
    updatedCount: 0,
    satellites,
  };
}

/** Number of records whose elements came from a live fetch (differ from the catalog). */
function countUpdated(satellites: SatelliteRecord[]): number {
  const reference = new Map(TLES.map((tle) => [tle.noradId, tle.line1]));
  return satellites.filter((s) => {
    const refLine = reference.get(s.noradId);
    return !!refLine && refLine !== s.line1;
  }).length;
}

export function detectCatalogObjectType(name: string): CatalogObjectType {
  const upper = name.toUpperCase();
  if (
    /\b(DEB|DEBRIS|FRAG|FRAGMENT|COOLANT|SHROUD|DISCARDED|COVER)\b/.test(upper) ||
    upper.includes(" DEB") ||
    upper.endsWith(" DEB") ||
    upper.includes(" DEBRIS")
  ) {
    return "debris";
  }
  if (
    /\b(R\/B|ROCKET BODY|STAGE|CENTAUR|BREEZE-M|FREGAT|TITAN 3C)\b/.test(upper) ||
    upper.includes(" R/B") ||
    upper.endsWith(" R/B") ||
    upper.includes("ROCKET BODY")
  ) {
    return "rocketBody";
  }
  return "active";
}

function toCatalogRecords(tles: Map<number, string[]>): CatalogRecord[] {
  const records: CatalogRecord[] = [];
  for (const [noradId, [name, line1, line2]] of tles) {
    records.push({
      id: `cat-${noradId}`,
      name,
      noradId,
      objectType: detectCatalogObjectType(name),
      line1,
      line2,
    });
  }
  records.sort((a, b) => a.noradId - b.noradId);
  return records;
}

function fullCatalogResponse(
  entry: FullCatalogCacheEntry,
  source: "celestrak" | "cache",
  isStale: boolean
): FullCatalogResponse {
  return {
    source,
    lastUpdated: new Date(entry.fetchedAt).toISOString(),
    isStale,
    count: entry.satellites.length,
    satellites: entry.satellites,
  };
}

function fallbackFullCatalog(): FullCatalogResponse {
  const satellites = (activeCatalogData.satellites as CatalogRecord[]) || [];
  return {
    source: "cache",
    lastUpdated: activeCatalogData.lastUpdated || new Date().toISOString(),
    isStale: true,
    count: satellites.length,
    satellites,
  };
}

/**
 * Return the full active-satellite catalog. Prefers fresh CelesTrak data;
 * falls back to the on-disk cache or bundled active catalog when a fetch fails (e.g. rate limit).
 */
export async function getFullCatalog(): Promise<FullCatalogResponse> {
  const cached = await readFullCache();
  const now = Date.now();

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return fullCatalogResponse(cached, "cache", false);
  }

  try {
    const tles = await getActiveTles();
    if (tles.size === 0) {
      if (cached) return fullCatalogResponse(cached, "cache", true);
      return fallbackFullCatalog();
    }
    const satellites = toCatalogRecords(tles);
    if (satellites.length === 0) {
      if (cached) return fullCatalogResponse(cached, "cache", true);
      return fallbackFullCatalog();
    }
    const entry: FullCatalogCacheEntry = { fetchedAt: now, satellites };
    await writeFullCache(entry);
    return fullCatalogResponse(entry, "celestrak", false);
  } catch (error) {
    if (cached) {
      return fullCatalogResponse(cached, "cache", true);
    }
    // Return bundled active catalog snapshot when live CelesTrak is rate-limited (HTTP 403) or offline
    const fallback = fallbackFullCatalog();
    if (fallback.satellites.length > 0) {
      return fallback;
    }
    // Attach the underlying error as `cause` so the route can log it without
    // leaking internals to the client.
    if (error instanceof FullCatalogError) {
      throw error;
    }
    throw new FullCatalogError(
      "FULL_CATALOG_UNREACHABLE",
      "The satellite catalog could not be reached. Try again in a few minutes.",
      { cause: error }
    );
  }
}