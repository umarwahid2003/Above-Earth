"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const fullCatalogError = useSatelliteStore((state) => state.fullCatalogError);
  const fullCatalogCode = useSatelliteStore((state) => state.fullCatalogCode);
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

  // The full catalog loads only after it has been activated, and each attempt
  // ends in either success or a bounded error. The effect is keyed off
  // [catalogMode, fullCatalogFetchId] — NOT fullCatalogStatus — so the
  // setFullCatalogLoading() transition cannot re-run it and discard the
  // in-flight response (previously the request resolved silently into a
  // permanent "Loading full catalog…" state).
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
        // Staged progress: data is in, satrecs parse and points build on the
        // next frame, then the browser is done.
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
      <button
        onClick={() => setOpen(true)}
        aria-label="Open satellite browser"
        aria-expanded={open}
        className="fixed left-4 top-4 z-20 flex size-10 items-center justify-center rounded-2xl border border-white/10 bg-[#0b0b0d]/80 text-neutral-300 shadow-2xl shadow-black/60 backdrop-blur-md transition-colors hover:text-white sm:left-5 sm:top-5"
      >
        <List className="size-4.5" />
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-20 bg-black/60 backdrop-blur-[2px] md:hidden"
        />
      )}

      <div
        ref={panelRef}
        role="dialog"
        aria-label="Satellite browser"
        inert={!open}
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-[19rem] max-w-[calc(100vw-2rem)] flex-col gap-3 p-4 transition-transform duration-300 ease-out will-change-transform",
          "md:inset-y-auto md:bottom-auto md:left-4 md:top-4 md:max-h-[calc(100dvh-10rem)] md:w-[19rem] md:p-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="shrink-0 rounded-2xl border border-white/10 bg-[#0b0b0d]/80 p-4 shadow-2xl shadow-black/60 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20 overflow-hidden">
              <img src="/logo.png" alt="Above Earth logo" className="size-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold tracking-tight text-white">
                Above <span className="text-neutral-400">Earth</span>
              </h1>
              <p className="text-xs text-neutral-500">
                {catalogMode === "full" ? (
                  fullCatalogStatus === "ready" ? (
                    <>
                      <span className="font-mono font-semibold text-white tabular-nums">
                        {fullCatalogCount.toLocaleString("en-US")}
                      </span>{" "}
                      active satellites
                    </>
                  ) : (
                    "Full catalog"
                  )
                ) : (
                  <>
                    <span className="font-mono font-semibold text-white tabular-nums">
                      {validCount}
                    </span>{" "}
                    satellites
                  </>
                )}
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close satellite browser"
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1">
            <button
              onClick={() => setCatalogMode("explore")}
              aria-pressed={catalogMode === "explore"}
              className={cn(
                "flex min-w-0 flex-col items-start rounded-lg px-3 py-2 text-left transition-colors",
                catalogMode === "explore"
                  ? "bg-white/10 ring-1 ring-white/25"
                  : "hover:bg-white/[0.05]"
              )}
            >
              <span className="flex w-full items-center justify-between gap-1 text-xs font-semibold text-neutral-100">
                <span>Explore</span>
                <span className="font-mono text-[11px] text-neutral-400 tabular-nums">
                  {validCount}
                </span>
              </span>
              <span className="text-[10px] text-neutral-500">
                Curated selection
              </span>
            </button>
            <button
              onClick={() => setCatalogMode("full")}
              aria-pressed={catalogMode === "full"}
              className={cn(
                "flex min-w-0 flex-col items-start rounded-lg px-3 py-2 text-left transition-colors",
                catalogMode === "full"
                  ? "bg-white/10 ring-1 ring-white/25"
                  : "hover:bg-white/[0.05]"
              )}
            >
              <span className="flex w-full items-center justify-between gap-1 text-xs font-semibold text-neutral-100">
                <span>Full Catalog</span>
                <span className="font-mono text-[11px] text-neutral-400 tabular-nums">
                  {fullCountLabel}
                </span>
              </span>
              <span className="text-[10px] text-neutral-500">
                Active satellites
              </span>
            </button>
          </div>

          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-neutral-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                catalogMode === "full"
                  ? "Search name or NORAD ID…"
                  : "Search satellites…"
              }
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2 pl-8 pr-8 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-neutral-500 hover:bg-white/10 hover:text-neutral-200"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {catalogMode === "explore" && (
            <div className="nice-scroll mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5">
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
              <div className="mt-3 flex flex-wrap gap-1.5">
                <ObjectToggle
                  active={showActive}
                  onClick={() => setShowActive(!showActive)}
                  label="Active"
                  count={fullCounts.active}
                />
                <ObjectToggle
                  active={showRocketBodies}
                  onClick={() => setShowRocketBodies(!showRocketBodies)}
                  label="Rocket bodies"
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

          {catalogMode === "full" && stagedLabel && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-xs text-neutral-400">
              <Loader2 className="size-3.5 shrink-0 animate-spin text-neutral-300" />
              <span>{stagedLabel}</span>
            </div>
          )}

          {catalogMode === "full" && fullCatalogStatus === "error" && (
            <div className="mt-3 rounded-xl border border-white/20 bg-white/[0.03] p-3" role="alert">
              <p className="text-xs leading-relaxed text-neutral-300">
                {fullCatalogError ?? FULL_CATALOG_ERROR_MESSAGE}
              </p>
              {fullCatalogCode && (
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-neutral-500">
                  {fullCatalogCode}
                </p>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => resetFullCatalog()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-neutral-200"
                >
                  <RefreshCw className="size-3.5" /> Retry
                </button>
                <button
                  onClick={() => setCatalogMode("explore")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-white/[0.06] hover:text-neutral-100"
                >
                  Back to Explore
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0d]/80 shadow-2xl shadow-black/60 backdrop-blur-md">
          {catalogMode === "full" && stagedLabel && (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-neutral-500">
              <Loader2 className="size-5 animate-spin text-neutral-300" />
              <p>{stagedLabel}…</p>
            </div>
          )}

          {catalogMode === "full" &&
            fullCatalogStatus === "error" &&
            !stagedLabel && (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 p-6 text-center text-sm text-neutral-500">
                <p>The Full Catalog could not be loaded.</p>
                <p className="text-xs text-neutral-600">Use Retry above to try again.</p>
              </div>
            )}

          {!(catalogMode === "full" && stagedLabel) && !(
            catalogMode === "full" && fullCatalogStatus === "error"
          ) && (
            <ul className="nice-scroll min-h-0 flex-1 overflow-y-auto p-1.5">
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
                        "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors",
                        active
                          ? "bg-white/10 ring-1 ring-white/25"
                          : "hover:bg-white/[0.05]"
                      )}
                    >
                      <span className="shrink-0 text-neutral-500">
                        {isFullRecord ? (
                          <Orbit className="size-3.5" />
                        ) : Glyph ? (
                          <Glyph className="size-3.5" />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-neutral-100">
                          {record.name}
                        </span>
                        <span className="block truncate text-[11px] text-neutral-500">
                          {record.noradId} · {meta}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {list.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-neutral-500">
                  No satellites match your filters.
                </li>
              )}
            </ul>
          )}

          {catalogMode === "full" &&
            fullCatalogStatus === "ready" &&
            fullFiltered.length > FULL_LIST_LIMIT && (
              <p className="border-t border-white/10 px-3 py-2 text-center text-[11px] text-neutral-500">
                Showing first {FULL_LIST_LIMIT} of{" "}
                {fullFiltered.length.toLocaleString("en-US")} — refine your
                search to see more.
              </p>
            )}
        </div>
      </div>
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
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
        active
          ? "border-white bg-white text-black"
          : "border-white/10 bg-white/[0.02] text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"
      )}
    >
      {Glyph ? <Glyph className="size-3" /> : null}
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
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
        active
          ? "border-white bg-white text-black"
          : "border-white/10 bg-white/[0.02] text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"
      )}
    >
      {label}
      <span
        className={cn(
          "font-mono text-[10px] tabular-nums",
          active ? "text-black/60" : "text-neutral-500"
        )}
      >
        {count.toLocaleString("en-US")}
      </span>
    </button>
  );
}
