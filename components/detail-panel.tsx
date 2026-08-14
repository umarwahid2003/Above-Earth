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
        "rounded-[2px] border border-white/10 bg-white/[0.03] px-2.5 py-1.5",
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
    const text = `🛰️ Tracking ${record.name} (NORAD ${record.noradId}) in real-time at ${velocityLabel} and ${altitudeLabel} on Above Earth!`;
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <aside className="pointer-events-none fixed inset-x-0 bottom-24 z-20 md:bottom-auto md:inset-x-auto md:right-6 md:top-1/2 md:-translate-y-1/2 md:w-[20.5rem]">
      <div className="pointer-events-auto mx-3 max-h-[65dvh] overflow-y-auto rounded-[4px] border border-white/20 bg-[#08080a]/90 p-3.5 shadow-2xl shadow-black/80 backdrop-blur-xl nice-scroll md:mx-0 md:max-h-[calc(100dvh-8rem)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[2px] bg-white/10 ring-1 ring-white/20">
              <Satellite className="size-4 text-white" />
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
            className="flex size-7 shrink-0 items-center justify-center rounded-[2px] text-neutral-400 transition-colors hover:bg-white/15 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Camera POV Switcher */}
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-[2px] border border-white/15 bg-white/[0.03] p-1">
          <button
            onClick={() => setCameraMode("free")}
            className="flex items-center justify-center gap-1.5 rounded-[2px] bg-white py-1.5 text-[10px] font-bold uppercase tracking-wider text-black shadow-xs transition-colors"
          >
            <Orbit className="size-3" />
            Orbit Cam
          </button>
          <button
            onClick={() => setCameraMode("pov")}
            className="flex items-center justify-center gap-1.5 rounded-[2px] py-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <Video className="size-3" />
            Cockpit POV
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
          <span className="rounded-[2px] border border-white/15 bg-white/10 px-1.5 py-0.5 font-bold uppercase tracking-wider text-white">
            {snapshot?.orbitType ?? "ORBIT"}
          </span>
          <span className="font-mono text-neutral-400">
            EPOCH {snapshot?.epochLabel ?? "—"}
          </span>
        </div>

        <div className="mt-2.5 rounded-[2px] border border-white/20 bg-white/[0.05] p-2.5">
          <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
            Velocity · Live Telemetry
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-mono text-xl font-bold leading-none text-white tabular-nums">
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
          <MetricRow label="Altitude · Live" value={altitudeLabel} />
          <MetricRow
            label="Ground Track"
            value="Active SGP4"
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
            className="flex items-center justify-center gap-1.5 rounded-[2px] border border-white/15 bg-white/[0.04] py-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-300 transition-colors hover:border-white/30 hover:bg-white/10 hover:text-white"
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
            className="flex items-center justify-center gap-1.5 rounded-[2px] border border-white/15 bg-white/[0.04] py-1.5 text-[10px] font-bold uppercase tracking-wider text-neutral-300 transition-colors hover:border-white/30 hover:bg-white/10 hover:text-white"
          >
            <Share2 className="size-3" />
            <span>Share to 𝕏</span>
          </button>
        </div>
      </div>
    </aside>
  );
}