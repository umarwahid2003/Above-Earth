"use client";

import { useMemo } from "react";
import { Satellite, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSatelliteStore } from "@/store/satellites";
import type { CatalogRecord, SatelliteRecord } from "@/lib/types";
import {
  parseOrbit,
  formatAltitude,
  formatVelocity,
  formatVelocityKmh,
  formatDegrees,
  formatPeriod,
} from "@/lib/orbits";

function MetricRow({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl bg-white/[0.04] px-3 py-2",
        wide && "col-span-2"
      )}
    >
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[13px] text-neutral-100 tabular-nums">
        {value}
      </div>
    </div>
  );
}

export default function DetailPanel() {
  const selectedId = useSatelliteStore((state) => state.selectedId);
  const setSelectedId = useSatelliteStore((state) => state.setSelectedId);
  const satellites = useSatelliteStore((state) => state.satellites);
  const fullCatalog = useSatelliteStore((state) => state.fullCatalog);
  const catalogMode = useSatelliteStore((state) => state.catalogMode);
  const live = useSatelliteStore((state) => state.liveMetrics);
  const lastUpdated = useSatelliteStore((state) => state.lastUpdated);

  const record: SatelliteRecord | CatalogRecord | null = useMemo(() => {
    if (catalogMode === "full") {
      return fullCatalog.find((item) => item.id === selectedId) ?? null;
    }
    return satellites.find((item) => item.id === selectedId) ?? null;
  }, [satellites, fullCatalog, selectedId, catalogMode]);
  const snapshot = useMemo(() => {
    if (!record) return null;
    try {
      return parseOrbit(record);
    } catch {
      return null;
    }
  }, [record]);

  if (!selectedId || !record) return null;

  const typeLabel = "objectType" in record ? record.objectType : record.category;

  const velocity = live.velocityKmS;
  const altitude = live.altitudeKm;
  const velocityLabel =
    velocity != null ? formatVelocity(velocity) : "Unavailable";
  const velocitySub = velocity != null ? formatVelocityKmh(velocity) : "";
  const altitudeLabel =
    altitude != null ? formatAltitude(altitude) : "Unavailable";

  return (
    <aside className="pointer-events-none fixed inset-x-0 bottom-0 z-20 md:inset-x-auto md:right-6 md:top-1/2 md:bottom-auto md:-translate-y-1/2 md:w-[20.5rem]">
      <div className="pointer-events-auto mx-3 mb-3 max-h-[70dvh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0b0d]/85 p-4 shadow-2xl shadow-black/60 backdrop-blur-md nice-scroll md:mx-0 md:mb-0 md:max-h-[calc(100dvh-8rem)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20">
              <Satellite className="size-4 text-neutral-200" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold leading-snug text-white">
                {record.name}
              </h2>
              <p className="mt-0.5 text-xs text-neutral-400">
                {typeLabel} · NORAD {record.noradId}
              </p>
            </div>
          </div>
          <button
            onClick={() => setSelectedId(null)}
            aria-label="Close satellite details"
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <span className="rounded-md bg-white/[0.06] px-2 py-0.5 font-medium text-neutral-300">
            {snapshot?.orbitType ?? "Unknown"}
          </span>
          <span className="text-neutral-500">
            TLE epoch {snapshot?.epochLabel ?? "Unavailable"}
          </span>
          <span className="text-neutral-500">
            Last refreshed{" "}
            {lastUpdated
              ? new Date(lastUpdated).toISOString().replace("T", " ").slice(0, 19) + "Z"
              : "Unavailable"}
          </span>
        </div>

        <div className="mt-3 rounded-xl border border-white/20 bg-white/[0.06] px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-wide text-neutral-400">
            Velocity · live
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-mono text-lg font-semibold leading-none text-white tabular-nums">
              {velocityLabel}
            </span>
            {velocitySub && (
              <span className="font-mono text-xs text-neutral-300 tabular-nums">
                {velocitySub}
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <MetricRow label="Altitude · live" value={altitudeLabel} />
          <MetricRow
            label="Ground track"
            value="Live propagated position"
            wide
          />
          <MetricRow
            label="Inclination"
            value={
              snapshot ? formatDegrees(snapshot.inclinationDeg) : "Unavailable"
            }
          />
          <MetricRow
            label="Period"
            value={snapshot ? formatPeriod(snapshot.periodMin) : "Unavailable"}
          />
          <MetricRow
            label="Perigee"
            value={
              snapshot ? formatAltitude(snapshot.perigeeKm) : "Unavailable"
            }
          />
          <MetricRow
            label="Apogee"
            value={
              snapshot ? formatAltitude(snapshot.apogeeKm) : "Unavailable"
            }
          />
          <MetricRow
            label="Eccentricity"
            value={
              snapshot
                ? snapshot.eccentricity.toFixed(4)
                : "Unavailable"
            }
            wide
          />
        </div>
      </div>
    </aside>
  );
}