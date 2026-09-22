import { promises as fs } from "node:fs";
import path from "node:path";
import activeCatalogData from "@/data/active-catalog.json";
import type { SatelliteCategory } from "@/data/categories";
import type { OrbitalDataSource } from "@/store/satellites";
import type {
  CatalogRecord,
  OmmElements,
  SatelliteRecord,
} from "@/lib/types";

const CACHE_VERSION = 2;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const FAILURE_RETRY_MS = 15 * 60 * 1000;
const FRESH_ELEMENT_MS = 3.5 * 24 * 60 * 60 * 1000;
const CACHE_DIR = path.join(process.cwd(), ".cache");
const ACTIVE_CACHE_FILE = path.join(CACHE_DIR, "celestrak-active-omm-v2.json");
const CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php";
const FETCH_TIMEOUT_MS = 20_000;
const EXPLORE_SIZE = 123;

type DataQuality = {
  freshCount: number;
  staleCount: number;
  oldestEpoch: string | null;
  newestEpoch: string | null;
};

type OrbitalDataResponse = DataQuality & {
  source: OrbitalDataSource;
  lastUpdated: string;
  isStale: boolean;
  satelliteCount: number;
  updatedCount: number;
  satellites: SatelliteRecord[];
};

export type FullCatalogResponse = DataQuality & {
  source: "celestrak" | "cache";
  lastUpdated: string;
  isStale: boolean;
  count: number;
  satellites: CatalogRecord[];
};

type ActiveCacheEntry = {
  version: number;
  fetchedAt: number;
  satellites: CatalogRecord[];
};

type ActiveDataset = ActiveCacheEntry & {
  source: "celestrak" | "cache" | "catalog";
  sourceStale: boolean;
};

type ActiveMemory = {
  expiresAt: number;
  dataset: ActiveDataset;
};

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

let activeMemory: ActiveMemory | null = null;
let activeInflight: Promise<ActiveDataset> | null = null;

function finite(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [headers, ...values] = rows;
  if (!headers) return [];
  return values.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]))
  );
}

function normalizeOmm(value: unknown): OmmElements | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const noradId = finite(row.NORAD_CAT_ID);
  const epoch = String(row.EPOCH ?? "");
  const objectName = String(row.OBJECT_NAME ?? "").trim();
  if (
    !Number.isInteger(noradId) ||
    noradId <= 0 ||
    !objectName ||
    !Number.isFinite(new Date(`${epoch.replace(/Z$/, "")}Z`).getTime())
  ) {
    return null;
  }

  const omm: OmmElements = {
    OBJECT_NAME: objectName,
    OBJECT_ID: String(row.OBJECT_ID ?? ""),
    EPOCH: epoch.replace(/Z$/, ""),
    MEAN_MOTION: finite(row.MEAN_MOTION),
    ECCENTRICITY: finite(row.ECCENTRICITY),
    INCLINATION: finite(row.INCLINATION),
    RA_OF_ASC_NODE: finite(row.RA_OF_ASC_NODE),
    ARG_OF_PERICENTER: finite(row.ARG_OF_PERICENTER),
    MEAN_ANOMALY: finite(row.MEAN_ANOMALY),
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: row.CLASSIFICATION_TYPE === "C" ? "C" : "U",
    NORAD_CAT_ID: noradId,
    ELEMENT_SET_NO: finite(row.ELEMENT_SET_NO),
    REV_AT_EPOCH: finite(row.REV_AT_EPOCH),
    BSTAR: finite(row.BSTAR),
    MEAN_MOTION_DOT: finite(row.MEAN_MOTION_DOT),
    MEAN_MOTION_DDOT: finite(row.MEAN_MOTION_DDOT),
  };

  const required = [
    omm.MEAN_MOTION,
    omm.ECCENTRICITY,
    omm.INCLINATION,
    omm.RA_OF_ASC_NODE,
    omm.ARG_OF_PERICENTER,
    omm.MEAN_ANOMALY,
    omm.BSTAR,
    omm.MEAN_MOTION_DOT,
    omm.MEAN_MOTION_DDOT,
  ];
  return required.every(Number.isFinite) && omm.MEAN_MOTION > 0 ? omm : null;
}

function ommToCatalogRecord(omm: OmmElements): CatalogRecord {
  return {
    id: `cat-${omm.NORAD_CAT_ID}`,
    name: omm.OBJECT_NAME,
    noradId: omm.NORAD_CAT_ID,
    objectType: "active",
    omm,
  };
}

function isUsableRecord(value: unknown): value is CatalogRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<CatalogRecord>;
  return (
    typeof row.name === "string" &&
    Number.isInteger(row.noradId) &&
    ((row.omm != null && normalizeOmm(row.omm) != null) ||
      (typeof row.line1 === "string" && typeof row.line2 === "string"))
  );
}

async function readActiveCache(): Promise<ActiveCacheEntry | null> {
  try {
    const raw = await fs.readFile(ACTIVE_CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<ActiveCacheEntry>;
    if (
      parsed.version !== CACHE_VERSION ||
      typeof parsed.fetchedAt !== "number" ||
      !Array.isArray(parsed.satellites)
    ) {
      return null;
    }
    const satellites = parsed.satellites.filter(isUsableRecord);
    return satellites.length > 0
      ? { version: CACHE_VERSION, fetchedAt: parsed.fetchedAt, satellites }
      : null;
  } catch {
    return null;
  }
}

async function writeActiveCache(entry: ActiveCacheEntry): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(ACTIVE_CACHE_FILE, JSON.stringify(entry), "utf8");
  } catch {
    // Persistence is best-effort. The in-memory copy remains authoritative.
  }
}

async function fetchActiveOmm(): Promise<CatalogRecord[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${CELESTRAK_URL}?GROUP=active&FORMAT=csv`, {
      headers: {
        "User-Agent": "above-earth/0.2 (interactive satellite globe)",
        Accept: "text/csv",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`CelesTrak responded ${response.status}`);
    const payload = parseCsv(await response.text());
    if (payload.length === 0) throw new Error("CelesTrak returned invalid CSV");
    const byId = new Map<number, CatalogRecord>();
    for (const value of payload) {
      const omm = normalizeOmm(value);
      if (omm) byId.set(omm.NORAD_CAT_ID, ommToCatalogRecord(omm));
    }
    const satellites = [...byId.values()].sort((a, b) => a.noradId - b.noradId);
    if (satellites.length === 0) throw new Error("CelesTrak returned no records");
    return satellites;
  } finally {
    clearTimeout(timer);
  }
}

function bundledFallback(): ActiveDataset {
  const raw = (activeCatalogData.satellites as unknown[]) ?? [];
  const satellites = raw
    .filter(isUsableRecord)
    .filter((record) => record.objectType === "active")
    .map((record) => ({ ...record, objectType: "active" as const }));
  const fetchedAt = new Date(activeCatalogData.lastUpdated).getTime();
  return {
    version: CACHE_VERSION,
    fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : 0,
    satellites,
    source: "catalog",
    sourceStale: true,
  };
}

async function loadActiveDataset(): Promise<ActiveDataset> {
  const now = Date.now();
  if (activeMemory && activeMemory.expiresAt > now) return activeMemory.dataset;
  const cached = await readActiveCache();
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    const dataset: ActiveDataset = {
      ...cached,
      source: "cache",
      sourceStale: false,
    };
    activeMemory = { expiresAt: cached.fetchedAt + CACHE_TTL_MS, dataset };
    return dataset;
  }

  try {
    const satellites = await fetchActiveOmm();
    const entry: ActiveCacheEntry = {
      version: CACHE_VERSION,
      fetchedAt: now,
      satellites,
    };
    await writeActiveCache(entry);
    const dataset: ActiveDataset = {
      ...entry,
      source: "celestrak",
      sourceStale: false,
    };
    activeMemory = { expiresAt: now + CACHE_TTL_MS, dataset };
    return dataset;
  } catch (error) {
    const dataset: ActiveDataset = cached
      ? { ...cached, source: "cache", sourceStale: true }
      : bundledFallback();
    if (dataset.satellites.length === 0) {
      throw new FullCatalogError(
        "FULL_CATALOG_UNREACHABLE",
        "The satellite catalog could not be reached. Try again in a few minutes.",
        { cause: error }
      );
    }
    activeMemory = { expiresAt: now + FAILURE_RETRY_MS, dataset };
    return dataset;
  }
}

async function getActiveDataset(): Promise<ActiveDataset> {
  if (activeInflight) return activeInflight;
  activeInflight = loadActiveDataset().finally(() => {
    activeInflight = null;
  });
  return activeInflight;
}

function recordEpochMs(record: CatalogRecord | SatelliteRecord): number {
  if (record.omm) {
    return new Date(`${record.omm.EPOCH.replace(/Z$/, "")}Z`).getTime();
  }
  if (!record.line1) return Number.NaN;
  const shortYear = Number(record.line1.slice(18, 20));
  const year = shortYear < 57 ? shortYear + 2000 : shortYear + 1900;
  const day = Number(record.line1.slice(20, 32));
  return Date.UTC(year, 0, 1) + (day - 1) * 86_400_000;
}

function summarizeQuality(
  records: readonly (CatalogRecord | SatelliteRecord)[],
  now = Date.now()
): DataQuality {
  const epochs = records.map(recordEpochMs).filter(Number.isFinite);
  const freshCount = epochs.filter((epoch) => now - epoch <= FRESH_ELEMENT_MS).length;
  return {
    freshCount,
    staleCount: records.length - freshCount,
    oldestEpoch: epochs.length ? new Date(Math.min(...epochs)).toISOString() : null,
    newestEpoch: epochs.length ? new Date(Math.max(...epochs)).toISOString() : null,
  };
}

const CATEGORY_PATTERNS: Array<[SatelliteCategory, RegExp]> = [
  [
    "ISS/Crewed",
    /\b(ISS|CSS|TIANHE|WENTIAN|MENGTIAN|SHENZHOU|TIANZHOU|CREW DRAGON|SOYUZ-MS|PROGRESS-MS|CYGNUS)\b/i,
  ],
  [
    "GPS/Navigation",
    /\b(GPS|NAVSTAR|GLONASS|GALILEO|BEIDOU|QZS|QZSS|IRNSS|NAVIC|WAAS|EGNOS)\b/i,
  ],
  [
    "Weather",
    /\b(NOAA|GOES|METOP|HIMAWARI|METEOR-M|FENGYUN|ELEKTRO|INSAT|JPSS|SUOMI|METEOSAT|GEO-KOMPSAT)\b/i,
  ],
  [
    "Science",
    /\b(HST|HUBBLE|JWST|CHANDRA|CXO|XMM|TERRA|AQUA|LANDSAT|SENTINEL|ICESAT|SWIFT|FERMI|FGRST|SDO|OCO|SMAP|GPM|GRACE|SWOT|TESS|CHEOPS|GAIA|EUCLID|EARTHCARE|BIOMASS)\b/i,
  ],
  [
    "Communications",
    /\b(STARLINK|ONEWEB|IRIDIUM|O3B|INTELSAT|EUTELSAT|SES|TELSTAR|INMARSAT|VIASAT|ORBCOMM|GLOBALSTAR|ASTRA|TDRS)\b/i,
  ],
];

const EXPLORE_QUOTAS: Record<SatelliteCategory, number> = {
  "ISS/Crewed": 12,
  Communications: 40,
  "GPS/Navigation": 28,
  Weather: 23,
  Science: 20,
};

function categoryForName(name: string): SatelliteCategory | null {
  return CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(name))?.[0] ?? null;
}

function selectExplore(records: readonly CatalogRecord[]): SatelliteRecord[] {
  const selected: SatelliteRecord[] = [];
  const seen = new Set<number>();
  for (const [category] of CATEGORY_PATTERNS) {
    const candidates = records.filter(
      (record) => categoryForName(record.name) === category
    );
    if (category === "ISS/Crewed") {
      candidates.sort((a, b) => {
        if (a.noradId === 25544) return -1;
        if (b.noradId === 25544) return 1;
        return a.noradId - b.noradId;
      });
    }
    for (const record of candidates.slice(0, EXPLORE_QUOTAS[category])) {
      if (seen.has(record.noradId)) continue;
      seen.add(record.noradId);
      selected.push({
        id: `sat-${record.noradId}`,
        name: record.name,
        noradId: record.noradId,
        category,
        ...(record.omm
          ? { omm: record.omm }
          : { line1: record.line1, line2: record.line2 }),
      });
    }
  }
  return selected.slice(0, EXPLORE_SIZE);
}

function isQualityStale(quality: DataQuality, count: number): boolean {
  return count === 0 || quality.freshCount / count < 0.9;
}

export async function getSatellites(): Promise<OrbitalDataResponse> {
  const dataset = await getActiveDataset();
  const satellites = selectExplore(dataset.satellites);
  const quality = summarizeQuality(satellites);
  return {
    source: dataset.source,
    lastUpdated: new Date(dataset.fetchedAt).toISOString(),
    isStale: dataset.sourceStale || isQualityStale(quality, satellites.length),
    satelliteCount: satellites.length,
    updatedCount: quality.freshCount,
    ...quality,
    satellites,
  };
}

/**
 * Immediate, network-free Explore payload for cold serverless starts.
 * The records come from the checked-in CelesTrak snapshot, not synthetic data.
 */
export function getBundledSatellites(): OrbitalDataResponse {
  const dataset = bundledFallback();
  const satellites = selectExplore(dataset.satellites);
  const quality = summarizeQuality(satellites);
  return {
    source: "catalog",
    lastUpdated: new Date(dataset.fetchedAt).toISOString(),
    isStale: true,
    satelliteCount: satellites.length,
    updatedCount: quality.freshCount,
    ...quality,
    satellites,
  };
}

export async function getFullCatalog(): Promise<FullCatalogResponse> {
  const dataset = await getActiveDataset();
  if (dataset.satellites.length === 0) {
    throw new FullCatalogError(
      "FULL_CATALOG_EMPTY",
      "The satellite catalog returned no active satellites."
    );
  }
  const quality = summarizeQuality(dataset.satellites);
  return {
    source: dataset.source === "celestrak" ? "celestrak" : "cache",
    lastUpdated: new Date(dataset.fetchedAt).toISOString(),
    isStale:
      dataset.sourceStale || isQualityStale(quality, dataset.satellites.length),
    count: dataset.satellites.length,
    ...quality,
    satellites: dataset.satellites,
  };
}
