"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Orbit, Satellite, Share2, Video, X } from "lucide-react";
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
        "rounded-lg border border-white/10 bg-white/[0.035] px-2.5 py-2",
        wide && "col-span-2"
      )}
    >
      <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-xs font-semibold text-white tabular-nums">
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
  const cameraMode = useSatelliteStore((state) => state.cameraMode);
  const setCameraMode = useSatelliteStore((state) => state.setCameraMode);

  const [copied, setCopied] = useState(false);

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

  if (!selectedId || !record || cameraMode === "pov") return null;

  const typeLabel = "objectType" in record ? record.objectType : record.category;

  const velocity = live.velocityKmS;
  const altitude = live.altitudeKm;
  const velocityLabel =
    velocity != null ? formatVelocity(velocity) : "Unavailable";
  const velocitySub = velocity != null ? formatVelocityKmh(velocity) : "";
  const altitudeLabel =
    altitude != null ? formatAltitude(altitude) : "Unavailable";

  const handleCopyLink = () => {
    const url = typeof window !== "undefined"
      ? `${window.location.origin}/?norad=${record.noradId}`
      : `https://above-earth.vercel.app/?norad=${record.noradId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareX = () => {
    const url = typeof window !== "undefined"
      ? `${window.location.origin}/?norad=${record.noradId}`
      : `https://above-earth.vercel.app/?norad=${record.noradId}`;
    const text = `🛰️ Viewing the SGP4-modeled orbit of ${record.name} (NORAD ${record.noradId}) at ${velocityLabel} and ${altitudeLabel} on Above Earth.`;
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <aside className="pointer-events-none fixed inset-x-0 bottom-24 z-20 sm:bottom-auto sm:inset-x-auto sm:right-5 sm:top-20 sm:w-[19.5rem] lg:right-6 lg:top-1/2 lg:-translate-y-1/2 lg:w-[21rem]">
      <div className="glass-panel nice-scroll pointer-events-auto mx-3 max-h-[48dvh] overflow-y-auto rounded-2xl p-3.5 sm:mx-0 sm:max-h-[calc(100dvh-10rem)] lg:max-h-[calc(100dvh-8rem)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-300/10 ring-1 ring-sky-300/25">
              <Satellite className="size-4 text-sky-200" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold uppercase tracking-wider text-white">
                {record.name}
              </h2>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-neutral-400">
                {typeLabel} · NORAD {record.noradId}
              </p>
            </div>
          </div>
          <button
            onClick={() => setSelectedId(null)}
            aria-label="Close satellite details"
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Camera POV Switcher */}
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/20 p-1">
          <button
            onClick={() => setCameraMode("free")}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-sky-200 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-950 shadow-xs transition-colors"
          >
            <Orbit className="size-3" />
            Orbit Cam
          </button>
          <button
            onClick={() => setCameraMode("pov")}
            className="flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <Video className="size-3" />
            Cockpit POV
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
          <span className="rounded-md border border-sky-300/20 bg-sky-300/10 px-1.5 py-0.5 font-bold uppercase tracking-wider text-sky-200">
            {snapshot?.orbitType ?? "ORBIT"}
          </span>
          <span className="font-mono text-neutral-400">
            EPOCH {snapshot?.epochLabel ?? "—"}
          </span>
        </div>

        <div className="mt-2.5 rounded-xl border border-sky-300/20 bg-gradient-to-br from-sky-300/[0.12] to-blue-400/[0.03] p-3">
          <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
            Modeled Orbital Velocity
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="font-mono text-xl font-bold leading-none text-sky-100 tabular-nums">
              {velocityLabel}
            </span>
            {velocitySub && (
              <span className="font-mono text-xs font-medium text-neutral-300 tabular-nums">
                {velocitySub}
              </span>
            )}
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <MetricRow label="Modeled Altitude" value={altitudeLabel} />
          <MetricRow
            label="Ground Track"
            value="SGP4 Estimate"
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

        {/* Share & Deep Link Actions */}
        <div className="mt-3 grid grid-cols-2 gap-1.5 border-t border-white/10 pt-2.5">
          <button
            onClick={handleCopyLink}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] py-2 text-[10px] font-bold uppercase tracking-wider text-neutral-300 transition-colors hover:border-sky-300/30 hover:bg-sky-300/10 hover:text-white"
          >
            {copied ? (
              <>
                <Check className="size-3 text-green-400" />
                <span className="text-green-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="size-3" />
                <span>Copy Link</span>
              </>
            )}
          </button>
          <button
            onClick={handleShareX}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] py-2 text-[10px] font-bold uppercase tracking-wider text-neutral-300 transition-colors hover:border-sky-300/30 hover:bg-sky-300/10 hover:text-white"
          >
            <Share2 className="size-3" />
            <span>Share to 𝕏</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
