import { create } from "zustand";
import { TLES, ISS_NORAD_ID } from "@/data/tles";
import type { CategoryFilter, OrbitPathMode } from "@/lib/filter";
import type { CatalogMode, CatalogRecord, SatelliteRecord } from "@/lib/types";

export const SIM_SPEEDS = [10, 60, 120, 300] as const;
export type SimSpeed = (typeof SIM_SPEEDS)[number];

export type OrbitalDataSource = "celestrak" | "cache" | "catalog";

export type FullCatalogStatus = "idle" | "loading" | "ready" | "error";

/** Coarse client-side progress shown while the Full Catalog loads. */
export type FullCatalogStage = "downloading" | "processing" | "rendering" | "done";

const DEFAULT_SATELLITES: SatelliteRecord[] = TLES.map((tle) => ({
  id: tle.id,
  name: tle.name,
  category: tle.category,
  noradId: tle.noradId,
  line1: tle.line1,
  line2: tle.line2,
}));

const DEFAULT_SELECTED_ID =
  TLES.find((tle) => tle.noradId === ISS_NORAD_ID)?.id ?? null;

export type LiveMetrics = {
  simTimeMs: number | null;
  velocityKmS: number | null;
  altitudeKm: number | null;
};

type SatelliteStore = {
  satellites: SatelliteRecord[];
  setSatellites: (satellites: SatelliteRecord[]) => void;
  dataSource: OrbitalDataSource;
  lastUpdated: string | null;
  isStale: boolean;
  updatedCount: number;
  setDataMeta: (meta: {
    source: OrbitalDataSource;
    lastUpdated: string | null;
    isStale: boolean;
    updatedCount: number;
  }) => void;

  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  running: boolean;
  setRunning: (running: boolean) => void;
  live: boolean;
  setLive: (live: boolean) => void;
  multiplier: SimSpeed;
  setMultiplier: (multiplier: SimSpeed) => void;
  ready: boolean;
  setReady: (ready: boolean) => void;
  validCount: number;
  setValidCount: (count: number) => void;
  cameraMode: "free" | "pov";
  setCameraMode: (mode: "free" | "pov") => void;

  showEarthImg: boolean;
  setShowEarthImg: (show: boolean) => void;
  showBorders: boolean;
  setShowBorders: (show: boolean) => void;
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
  showCities: boolean;
  setShowCities: (show: boolean) => void;

  orbitMode: OrbitPathMode;
  setOrbitMode: (mode: OrbitPathMode) => void;

  query: string;
  setQuery: (query: string) => void;
  category: CategoryFilter;
  setCategory: (category: CategoryFilter) => void;

  catalogMode: CatalogMode;
  setCatalogMode: (mode: CatalogMode) => void;

  fullCatalog: CatalogRecord[];
  fullCatalogStatus: FullCatalogStatus;
  fullCatalogError: string | null;
  fullCatalogCode: string | null;
  fullCatalogStage: FullCatalogStage | null;
  fullCatalogFetchId: number;
  fullCatalogSource: "celestrak" | "cache" | null;
  fullCatalogUpdated: string | null;
  fullCatalogCount: number;
  setFullCatalogLoading: () => void;
  setFullCatalogReady: (payload: {
    satellites: CatalogRecord[];
    source: "celestrak" | "cache";
    updated: string | null;
    count: number;
  }) => void;
  setFullCatalogError: (message: string) => void;
  setFullCatalogCode: (code: string | null) => void;
  setFullCatalogStage: (stage: FullCatalogStage | null) => void;
  requestFullCatalogFetch: () => void;
  resetFullCatalog: () => void;

  showActive: boolean;
  setShowActive: (show: boolean) => void;
  showRocketBodies: boolean;
  setShowRocketBodies: (show: boolean) => void;
  showDebris: boolean;
  setShowDebris: (show: boolean) => void;

  liveMetrics: LiveMetrics;
  setLiveMetrics: (metrics: Partial<LiveMetrics>) => void;
};

const MAP_TOGGLES_STORAGE_KEY = "orbit-atlas.map-toggles";

const DEFAULT_MAP_TOGGLES = {
  showEarthImg: true,
  showBorders: true,
  showGrid: true,
  showCities: false,
} as const;

function loadStoredMapToggles() {
  if (typeof window === "undefined") return { ...DEFAULT_MAP_TOGGLES };
  try {
    const raw = window.localStorage.getItem(MAP_TOGGLES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MAP_TOGGLES };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      showEarthImg:
        typeof parsed.showEarthImg === "boolean"
          ? parsed.showEarthImg
          : DEFAULT_MAP_TOGGLES.showEarthImg,
      showBorders:
        typeof parsed.showBorders === "boolean"
          ? parsed.showBorders
          : DEFAULT_MAP_TOGGLES.showBorders,
      showGrid:
        typeof parsed.showGrid === "boolean"
          ? parsed.showGrid
          : DEFAULT_MAP_TOGGLES.showGrid,
      showCities:
        typeof parsed.showCities === "boolean"
          ? parsed.showCities
          : DEFAULT_MAP_TOGGLES.showCities,
    };
  } catch {
    return { ...DEFAULT_MAP_TOGGLES };
  }
}

const initialMapToggles = loadStoredMapToggles();

function persistMapToggles(state: SatelliteStore) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      MAP_TOGGLES_STORAGE_KEY,
      JSON.stringify({
        showEarthImg: state.showEarthImg,
        showBorders: state.showBorders,
        showGrid: state.showGrid,
        showCities: state.showCities,
      })
    );
  } catch {
    // Storage unavailable (private mode / quota) — session-only preferences.
  }
}

export const useSatelliteStore = create<SatelliteStore>((set, get) => ({
  satellites: DEFAULT_SATELLITES,
  setSatellites: (satellites) => set({ satellites }),
  dataSource: "catalog",
  lastUpdated: null,
  isStale: true,
  updatedCount: 0,
  setDataMeta: (meta) => set(meta),

  selectedId: DEFAULT_SELECTED_ID,
  setSelectedId: (selectedId) =>
    set((state) => ({
      selectedId,
      cameraMode: selectedId ? state.cameraMode : "free",
    })),
  cameraMode: "free",
  setCameraMode: (cameraMode) => set({ cameraMode }),
  running: true,
  setRunning: (running) => set({ running }),
  live: true,
  setLive: (live) => set({ live }),
  multiplier: 60,
  setMultiplier: (multiplier) => set({ multiplier }),
  ready: false,
  setReady: (ready) => set({ ready }),
  validCount: 0,
  setValidCount: (validCount) => set({ validCount }),

  showEarthImg: initialMapToggles.showEarthImg,
  setShowEarthImg: (show) => {
    set({ showEarthImg: show });
    persistMapToggles(get());
  },
  showBorders: initialMapToggles.showBorders,
  setShowBorders: (show) => {
    set({ showBorders: show });
    persistMapToggles(get());
  },
  showGrid: initialMapToggles.showGrid,
  setShowGrid: (show) => {
    set({ showGrid: show });
    persistMapToggles(get());
  },
  showCities: initialMapToggles.showCities,
  setShowCities: (show) => {
    set({ showCities: show });
    persistMapToggles(get());
  },

  orbitMode: "selected",
  setOrbitMode: (orbitMode) => set({ orbitMode }),

  query: "",
  setQuery: (query) => set({ query }),
  category: "All",
  setCategory: (category) => set({ category }),

  catalogMode: "explore",
  setCatalogMode: (catalogMode) => set({ catalogMode, selectedId: null }),

  fullCatalog: [],
  fullCatalogStatus: "idle",
  fullCatalogError: null,
  fullCatalogCode: null,
  fullCatalogStage: null,
  fullCatalogFetchId: 0,
  fullCatalogSource: null,
  fullCatalogUpdated: null,
  fullCatalogCount: 0,
  setFullCatalogLoading: () =>
    set({
      fullCatalogStatus: "loading",
      fullCatalogError: null,
      fullCatalogCode: null,
      fullCatalogStage: "downloading",
    }),
  setFullCatalogReady: (payload) =>
    set({
      fullCatalogStatus: "ready",
      fullCatalog: payload.satellites,
      fullCatalogSource: payload.source,
      fullCatalogUpdated: payload.updated,
      fullCatalogCount: payload.count,
      fullCatalogError: null,
      fullCatalogCode: null,
    }),
  setFullCatalogError: (message) =>
    set({
      fullCatalogStatus: "error",
      fullCatalogError: message,
      fullCatalogStage: null,
    }),
  setFullCatalogCode: (fullCatalogCode) => set({ fullCatalogCode }),
  setFullCatalogStage: (fullCatalogStage) => set({ fullCatalogStage }),
  requestFullCatalogFetch: () =>
    set((state) => ({ fullCatalogFetchId: state.fullCatalogFetchId + 1 })),
  resetFullCatalog: () =>
    set((state) => ({
      fullCatalogStatus: "idle",
      fullCatalogError: null,
      fullCatalogCode: null,
      fullCatalogStage: null,
      fullCatalogFetchId: state.fullCatalogFetchId + 1,
    })),

  showActive: true,
  setShowActive: (showActive) => set({ showActive }),
  showRocketBodies: false,
  setShowRocketBodies: (showRocketBodies) => set({ showRocketBodies }),
  showDebris: false,
  setShowDebris: (showDebris) => set({ showDebris }),

  liveMetrics: { simTimeMs: null, velocityKmS: null, altitudeKm: null },
  setLiveMetrics: (liveMetrics) =>
    set((state) => ({ liveMetrics: { ...state.liveMetrics, ...liveMetrics } })),
}));