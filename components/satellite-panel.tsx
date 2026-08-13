"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Cloud,
  FlaskConical,
  List,
  Loader2,
  Navigation,
  Orbit,
  RadioTower,
  RefreshCw,
  Rocket,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SATELLITE_CATEGORIES,
  type SatelliteCategory,
} from "@/data/tles";
import {
  filterFullCatalog,
  filterSatellites,
  type ObjectTypeFilter,
} from "@/lib/filter";
import { useSatelliteStore, type FullCatalogStage } from "@/store/satellites";
import type { CatalogRecord } from "@/lib/types";

// Monochrome symbol per category — colour is never used for meaning.
const CATEGORY_GLYPH: Record<SatelliteCategory, LucideIcon> = {
  "ISS/Crewed": Rocket,
  Communications: RadioTower,
  "GPS/Navigation": Navigation,
  Weather: Cloud,
  Science: FlaskConical,
};

const OBJECT_TYPE_LABEL: Record<ObjectTypeFilter, string> = {
  active: "Active satellites",
  rocketBody: "Rocket bodies",
  debris: "Debris",
};

const FULL_LIST_LIMIT = 250;

// Bounded client request: if the server has not answered in time the request
// is aborted and a useful error is shown instead of an endless spinner.
const FULL_CATALOG_TIMEOUT_MS = 15_000;
const FULL_CATALOG_ERROR_MESSAGE =
  "The Full Catalog could not be loaded. Try again in a few minutes.";

const STAGE_LABEL: Record<Exclude<FullCatalogStage, "done">, string> = {
  downloading: "Downloading catalog",
  processing: "Processing records",
  rendering: "Rendering objects",
};

type FullCatalogErrorPayload = {
  code?: string;
  message?: string;
  status?: number;
};

type FullCatalogPayload = {
  satellites?: CatalogRecord[];
  source?: string;
  lastUpdated?: string | null;
  count?: number;
  error?: FullCatalogErrorPayload;
};

class FullCatalogFetchError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "FullCatalogFetchError";
  }
}

export default function SatellitePanel() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const satellites = useSatelliteStore((state) => state.satellites);
  const selectedId = useSatelliteStore((state) => state.selectedId);
  const setSelectedId = useSatelliteStore((state) => state.setSelectedId);
  const validCount = useSatelliteStore((state) => state.validCount);
  const query = useSatelliteStore((state) => state.query);
  const setQuery = useSatelliteStore((state) => state.setQuery);
  const category = useSatelliteStore((state) => state.category);
  const setCategory = useSatelliteStore((state) => state.setCategory);
  const catalogMode = useSatelliteStore((state) => state.catalogMode);
  const setCatalogMode = useSatelliteStore((state) => state.setCatalogMode);
  const fullCatalog = useSatelliteStore((state) => state.fullCatalog);
  const fullCatalogStatus = useSatelliteStore(
    (state) => state.fullCatalogStatus
  );
  const fullCatalogCount = useSatelliteStore((state) => state.fullCatalogCount);
  const fullCatalogStage = useSatelliteStore((state) => state.fullCatalogStage);
  const fullCatalogFetchId = useSatelliteStore(
    (state) => state.fullCatalogFetchId
  );
  const resetFullCatalog = useSatelliteStore((state) => state.resetFullCatalog);
  const showActive = useSatelliteStore((state) => state.showActive);
  const setShowActive = useSatelliteStore((state) => state.setShowActive);
  const showRocketBodies = useSatelliteStore((state) => state.showRocketBodies);
  const setShowRocketBodies = useSatelliteStore(
    (state) => state.setShowRocketBodies
  );
  const showDebris = useSatelliteStore((state) => state.showDebris);
  const setShowDebris = useSatelliteStore((state) => state.setShowDebris);

  const filtered = useMemo(
    () => filterSatellites(satellites, query, category),
    [satellites, query, category]
  );

  const fullFiltered = useMemo(
    () =>
      filterFullCatalog(fullCatalog, query, {
        active: showActive,
        rocketBody: showRocketBodies,
        debris: showDebris,
      }),
    [fullCatalog, query, showActive, showRocketBodies, showDebris]
  );

  const fullCounts = useMemo(() => {
    const counts = { active: 0, rocketBody: 0, debris: 0 };
    for (const record of fullCatalog) {
      if (record.objectType === "active") counts.active += 1;
      else if (record.objectType === "rocketBody") counts.rocketBody += 1;
      else if (record.objectType === "debris") counts.debris += 1;
    }
    return counts;
  }, [fullCatalog]);

  const fullList = fullFiltered.slice(0, FULL_LIST_LIMIT);

  useEffect(() => {
    if (catalogMode !== "full") return;
    const state = useSatelliteStore.getState();
    if (state.fullCatalogStatus === "ready") return;

    let active = true;
    let stageTimer = 0;
    let stageTimer2 = 0;
    let stageTimer3 = 0;

    state.setFullCatalogLoading();
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      FULL_CATALOG_TIMEOUT_MS
    );

    fetch("/api/full-catalog", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as FullCatalogPayload;
        if (!active) return;
        if (!response.ok) {
          const apiError = data.error;
          throw new FullCatalogFetchError(
            typeof apiError?.code === "string" && apiError.code
              ? apiError.code
              : "FULL_CATALOG_UNKNOWN",
            typeof apiError?.message === "string" && apiError.message
              ? apiError.message
              : FULL_CATALOG_ERROR_MESSAGE
          );
        }
        if (!Array.isArray(data.satellites)) {
          throw new FullCatalogFetchError(
            "FULL_CATALOG_INVALID",
            "The Full Catalog response was invalid."
          );
        }
        if (data.satellites.length === 0) {
          throw new FullCatalogFetchError(
            "FULL_CATALOG_EMPTY",
            "The Full Catalog returned no active satellites."
          );
        }
        useSatelliteStore.getState().setFullCatalogReady({
          satellites: data.satellites,
          source: data.source === "celestrak" ? "celestrak" : "cache",
          updated: data.lastUpdated ?? null,
          count:
            typeof data.count === "number"
              ? data.count
              : data.satellites.length,
        });
        stageTimer = window.setTimeout(() => {
          if (!active) return;
          useSatelliteStore.getState().setFullCatalogStage("processing");
        }, 50);
        stageTimer2 = window.setTimeout(() => {
          if (!active) return;
          useSatelliteStore.getState().setFullCatalogStage("rendering");
        }, 550);
        stageTimer3 = window.setTimeout(() => {
          if (!active) return;
          useSatelliteStore.getState().setFullCatalogStage("done");
        }, 1050);
      })
      .catch((error: unknown) => {
        if (!active) return;
        let code = "FULL_CATALOG_UNKNOWN";
        let message = FULL_CATALOG_ERROR_MESSAGE;
        if (error instanceof FullCatalogFetchError) {
          code = error.code;
          message = error.message;
        } else if (error instanceof DOMException && error.name === "AbortError") {
          code = "FULL_CATALOG_TIMEOUT";
          message = `The Full Catalog request timed out after ${
            FULL_CATALOG_TIMEOUT_MS / 1000
          } seconds.`;
        } else if (error instanceof Error) {
          message = error.message || FULL_CATALOG_ERROR_MESSAGE;
        }
        useSatelliteStore.getState().setFullCatalogError(message);
        useSatelliteStore.getState().setFullCatalogCode(code);
      });

    return () => {
      active = false;
      window.clearTimeout(timeout);
      window.clearTimeout(stageTimer);
      window.clearTimeout(stageTimer2);
      window.clearTimeout(stageTimer3);
      controller.abort();
      const current = useSatelliteStore.getState();
      if (current.catalogMode !== "full") {
        current.setFullCatalogStage(null);
        current.resetFullCatalog();
      }
    };
  }, [catalogMode, fullCatalogFetchId]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Clicking outside the drawer closes it (desktop).
  useEffect(() => {
    if (!open) return;
    const onClick = (event: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onClick);
    return () => document.removeEventListener("pointerdown", onClick);
  }, [open]);

  const fullCountLabel =
    fullCatalogStatus === "ready"
      ? fullCatalogCount.toLocaleString("en-US")
      : "…";

  const stagedLabel =
    fullCatalogStage && fullCatalogStage !== "done"
      ? STAGE_LABEL[fullCatalogStage]
      : null;

  const list = catalogMode === "full" ? fullList : filtered;

  return (
    <>
      {/* Sleek Aerospace HUD Trigger Bar (When Sidebar is Closed) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open satellite mission browser"
          aria-expanded={open}
          className="fixed left-4 top-4 z-20 flex items-center gap-2.5 rounded-[3px] border border-white/20 bg-[#08080a]/90 px-3 py-2 text-neutral-200 shadow-2xl shadow-black/80 backdrop-blur-xl transition-all hover:border-white/40 hover:bg-[#0c0c10] hover:text-white sm:left-5 sm:top-5"
        >
          <div className="flex size-6 shrink-0 items-center justify-center rounded-[2px] bg-white/10 ring-1 ring-white/20 overflow-hidden">
            <Image
              src="/logo.png"
              alt="Above Earth logo"
              width={24}
              height={24}
              className="size-full object-cover"
            />
          </div>
          <div className="flex items-center gap-2 text-left">
            <span className="text-xs font-bold uppercase tracking-wider text-white">
              Above Earth
            </span>
            <span className="h-3 w-px bg-white/15" />
            <span className="font-mono text-[11px] font-semibold text-neutral-400 tabular-nums">
              {catalogMode === "full" && fullCatalogStatus === "ready"
                ? `${fullCatalogCount.toLocaleString("en-US")} OBJECTS`
                : `${validCount} SATELLITES`}
            </span>
          </div>
          <List className="ml-1 size-3.5 text-neutral-400" />
        </button>
      )}

      {/* Backdrop overlay for mobile */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-20 bg-black/75 backdrop-blur-xs md:hidden"
        />
      )}

      {/* Unified Mission Control Sidebar Panel */}
      {open && (
        <aside
          ref={panelRef}
          role="dialog"
          aria-label="Satellite mission browser"
          className="fixed inset-x-3 top-3 z-30 flex max-h-[calc(100dvh-1.5rem)] flex-col rounded-[4px] border border-white/20 bg-[#08080a]/95 shadow-2xl shadow-black/90 backdrop-blur-2xl md:inset-x-auto md:left-4 md:top-4 md:h-[calc(100dvh-2rem)] md:max-h-[820px] md:w-[21rem] animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="shrink-0 border-b border-white/15 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-[2px] bg-white/10 ring-1 ring-white/20 overflow-hidden">
                  <Image
                    src="/logo.png"
                    alt="Above Earth logo"
                    width={28}
                    height={28}
                    className="size-full object-cover"
                  />
                </div>
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                    Above <span className="text-neutral-400">Earth</span>
                  </h2>
                  <p className="font-mono text-[10px] uppercase tracking-wide text-neutral-400">
                    {catalogMode === "full" ? (
                      fullCatalogStatus === "ready" ? (
                        <>
                          <span className="font-bold text-white tabular-nums">
                            {fullCatalogCount.toLocaleString("en-US")}
                          </span>{" "}
                          ACTIVE OBJECTS
                        </>
                      ) : (
                        "FULL CATALOG"
                      )
                    ) : (
                      <>
                        <span className="font-bold text-white tabular-nums">
                          {validCount}
                        </span>{" "}
                        SATELLITES TRACKED
                      </>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close satellite browser"
                className="flex size-7 items-center justify-center rounded-[2px] text-neutral-400 transition-colors hover:bg-white/15 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Segmented Control */}
            <div className="mt-3 grid grid-cols-2 gap-1 rounded-[2px] border border-white/15 bg-white/[0.03] p-1">
              <button
                onClick={() => setCatalogMode("explore")}
                aria-pressed={catalogMode === "explore"}
                className={cn(
                  "flex min-w-0 flex-col items-start rounded-[2px] px-2.5 py-1.5 text-left transition-colors",
                  catalogMode === "explore"
                    ? "bg-white text-black font-semibold shadow-xs"
                    : "text-neutral-300 hover:bg-white/[0.08]"
                )}
              >
                <span className="flex w-full items-center justify-between gap-1 text-[11px] font-bold uppercase tracking-wider">
                  <span>Explore</span>
                  <span
                    className={cn(
                      "font-mono text-[10px] tabular-nums",
                      catalogMode === "explore" ? "text-black/70" : "text-neutral-400"
                    )}
                  >
                    {validCount}
                  </span>
                </span>
                <span
                  className={cn(
                    "text-[9px] uppercase tracking-wide",
                    catalogMode === "explore" ? "text-black/60" : "text-neutral-500"
                  )}
                >
                  Curated Fleet
                </span>
              </button>
              <button
                onClick={() => setCatalogMode("full")}
                aria-pressed={catalogMode === "full"}
                className={cn(
                  "flex min-w-0 flex-col items-start rounded-[2px] px-2.5 py-1.5 text-left transition-colors",
                  catalogMode === "full"
                    ? "bg-white text-black font-semibold shadow-xs"
                    : "text-neutral-300 hover:bg-white/[0.08]"
                )}
              >
                <span className="flex w-full items-center justify-between gap-1 text-[11px] font-bold uppercase tracking-wider">
                  <span>Full Catalog</span>
                  <span
                    className={cn(
                      "font-mono text-[10px] tabular-nums",
                      catalogMode === "full" ? "text-black/70" : "text-neutral-400"
                    )}
                  >
                    {fullCountLabel}
                  </span>
                </span>
                <span
                  className={cn(
                    "text-[9px] uppercase tracking-wide",
                    catalogMode === "full" ? "text-black/60" : "text-neutral-500"
                  )}
                >
                  Global Orbit
                </span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative mt-2.5">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-neutral-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  catalogMode === "full"
                    ? "Search name or NORAD ID…"
                    : "Search satellites…"
                }
                className="w-full rounded-[2px] border border-white/15 bg-white/[0.04] py-1.5 pl-8 pr-8 text-xs font-medium text-neutral-100 placeholder:text-neutral-500 focus:border-white/50 focus:outline-none focus:ring-1 focus:ring-white/25"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded-[2px] text-neutral-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>

            {/* Category / Object Filters */}
            {catalogMode === "explore" && (
              <div className="nice-scroll mt-2.5 flex items-center gap-1 overflow-x-auto pb-0.5">
                <FilterChip
                  active={category === "All"}
                  onClick={() => setCategory("All")}
                  label="All"
                />
                {SATELLITE_CATEGORIES.map((value) => (
                  <FilterChip
                    key={value}
                    active={category === value}
                    onClick={() => setCategory(value)}
                    label={value}
                    glyph={CATEGORY_GLYPH[value]}
                  />
                ))}
              </div>
            )}

            {catalogMode === "full" &&
              fullCatalogStatus === "ready" &&
              fullCatalogStage !== null &&
              fullCatalogStage !== "processing" &&
              fullCatalogStage !== "rendering" && (
                <div className="mt-2.5 flex flex-wrap gap-1">
                  <ObjectToggle
                    active={showActive}
                    onClick={() => setShowActive(!showActive)}
                    label="Active"
                    count={fullCounts.active}
                  />
                  <ObjectToggle
                    active={showRocketBodies}
                    onClick={() => setShowRocketBodies(!showRocketBodies)}
                    label="R/B"
                    count={fullCounts.rocketBody}
                  />
                  <ObjectToggle
                    active={showDebris}
                    onClick={() => setShowDebris(!showDebris)}
                    label="Debris"
                    count={fullCounts.debris}
                  />
                </div>
              )}

            {catalogMode === "full" && fullCatalogStatus === "error" && (
              <div className="mt-2.5 flex items-center justify-between gap-2 rounded-[2px] border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-200">
                <span className="truncate">Catalog unreachable</span>
                <button
                  onClick={() => resetFullCatalog()}
                  className="inline-flex items-center gap-1 rounded-[2px] bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-100 hover:bg-red-500/30"
                >
                  <RefreshCw className="size-3" /> Retry
                </button>
              </div>
            )}
          </div>

          {/* Body List Area */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {catalogMode === "full" && stagedLabel && (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-xs text-neutral-400">
                <Loader2 className="size-4 animate-spin text-white" />
                <p className="font-mono uppercase tracking-wider">{stagedLabel}…</p>
              </div>
            )}

            {catalogMode === "full" &&
              fullCatalogStatus === "error" &&
              !stagedLabel && (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 p-6 text-center text-xs text-neutral-400">
                  <p>Full Catalog unavailable.</p>
                  <p className="text-[10px] text-neutral-600">
                    Use Retry above to reconnect.
                  </p>
                </div>
              )}

            {!(catalogMode === "full" && stagedLabel) &&
              !(catalogMode === "full" && fullCatalogStatus === "error") && (
                <ul className="nice-scroll min-h-0 flex-1 overflow-y-auto p-1.5 space-y-0.5">
                  {list.map((record) => {
                    const active = record.id === selectedId;
                    const isFullRecord = "objectType" in record;
                    const objectType = isFullRecord
                      ? (record as CatalogRecord).objectType
                      : null;
                    const category = isFullRecord
                      ? null
                      : (record as { category: SatelliteCategory }).category;
                    const Glyph = category ? CATEGORY_GLYPH[category] : null;
                    const meta = isFullRecord
                      ? objectType === "unknown"
                        ? "Unknown"
                        : (OBJECT_TYPE_LABEL[objectType as ObjectTypeFilter] ??
                          objectType)
                      : category;
                    return (
                      <li key={record.id}>
                        <button
                          onClick={() => setSelectedId(record.id)}
                          aria-pressed={active}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-[2px] px-2.5 py-1.5 text-left transition-colors",
                            active
                              ? "bg-white text-black font-semibold shadow-xs"
                              : "hover:bg-white/[0.06]"
                          )}
                        >
                          <span
                            className={cn(
                              "shrink-0",
                              active ? "text-black" : "text-neutral-500"
                            )}
                          >
                            {isFullRecord ? (
                              <Orbit className="size-3.5" />
                            ) : Glyph ? (
                              <Glyph className="size-3.5" />
                            ) : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                "block truncate text-xs font-semibold uppercase tracking-wide",
                                active ? "text-black" : "text-neutral-100"
                              )}
                            >
                              {record.name}
                            </span>
                            <span
                              className={cn(
                                "block truncate font-mono text-[10px]",
                                active ? "text-black/70" : "text-neutral-500"
                              )}
                            >
                              {record.noradId} · {meta}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {list.length === 0 && (
                    <li className="px-3 py-6 text-center text-xs text-neutral-500 uppercase tracking-wide">
                      No satellites match filters.
                    </li>
                  )}
                </ul>
              )}
          </div>

          {/* Footer Metadata */}
          <div className="shrink-0 border-t border-white/15 px-3 py-1.5 text-center font-mono text-[10px] text-neutral-500">
            {catalogMode === "full" ? (
              <span>
                SHOWING {list.length} OF{" "}
                {fullFiltered.length.toLocaleString("en-US")} ACTIVE OBJECTS
              </span>
            ) : (
              <span>
                {filtered.length} OF {validCount} SATELLITES DISPLAYED
              </span>
            )}
          </div>
        </aside>
      )}
    </>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  glyph,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  glyph?: LucideIcon;
}) {
  const Glyph = glyph;
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[2px] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
        active
          ? "border-white bg-white text-black"
          : "border-white/15 bg-white/[0.02] text-neutral-400 hover:border-white/30 hover:bg-white/[0.06] hover:text-white"
      )}
    >
      {Glyph ? <Glyph className="size-2.5" /> : null}
      {label}
    </button>
  );
}

function ObjectToggle({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-[2px] border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
        active
          ? "border-white bg-white text-black"
          : "border-white/15 bg-white/[0.02] text-neutral-400 hover:border-white/30 hover:bg-white/[0.06] hover:text-white"
      )}
    >
      {label}
      <span
        className={cn(
          "font-mono text-[9px] tabular-nums",
          active ? "text-black/70" : "text-neutral-500"
        )}
      >
        {count.toLocaleString("en-US")}
      </span>
    </button>
  );
}
