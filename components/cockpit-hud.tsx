"use client";

import { useEffect, useMemo } from "react";
import { Orbit, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSatelliteStore } from "@/store/satellites";
import {
  formatAltitude,
  formatDegrees,
  formatVelocity,
  formatVelocityKmh,
  parseOrbit,
} from "@/lib/orbits";
import type { CatalogRecord, SatelliteRecord } from "@/lib/types";

export default function CockpitHud() {
  const cameraMode = useSatelliteStore((state) => state.cameraMode);
  const setCameraMode = useSatelliteStore((state) => state.setCameraMode);
  const selectedId = useSatelliteStore((state) => state.selectedId);
  const satellites = useSatelliteStore((state) => state.satellites);
  const fullCatalog = useSatelliteStore((state) => state.fullCatalog);
  const catalogMode = useSatelliteStore((state) => state.catalogMode);
  const live = useSatelliteStore((state) => state.liveMetrics);
  const multiplier = useSatelliteStore((state) => state.multiplier);
  const setMultiplier = useSatelliteStore((state) => state.setMultiplier);
  const isLive = useSatelliteStore((state) => state.live);
  const setLive = useSatelliteStore((state) => state.setLive);

  const record: SatelliteRecord | CatalogRecord | null = useMemo(() => {
    if (!selectedId) return null;
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

  useEffect(() => {
    if (cameraMode !== "pov") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCameraMode("free");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cameraMode, setCameraMode]);

  if (cameraMode !== "pov" || !record) return null;

  const vel = live.velocityKmS;
  const alt = live.altitudeKm;

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex flex-col justify-between p-4 sm:p-6 select-none animate-in fade-in duration-300">
      {/* Top Cockpit Header Bar */}
      <div className="flex items-start justify-between gap-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-[3px] border border-white/25 bg-[#08080a]/90 px-3.5 py-2 shadow-2xl backdrop-blur-xl">
          <div className="flex size-3 items-center justify-center">
            <span className="size-2 rounded-full bg-cyan-400 animate-ping" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-white">
                {record.name}
              </span>
              <span className="rounded-[2px] bg-cyan-500/20 px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-widest text-cyan-300">
                COCKPIT POV
              </span>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-wide text-neutral-400">
              NORAD {record.noradId} · FLIGHT PATH NADIR SENSOR
            </p>
          </div>
        </div>

        {/* Exit Cockpit Button */}
        <button
          onClick={() => setCameraMode("free")}
          className="pointer-events-auto flex items-center gap-2 rounded-[3px] border border-white/30 bg-white/15 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-2xl backdrop-blur-xl transition-all hover:bg-white hover:text-black"
        >
          <Orbit className="size-3.5" />
          <span>Exit Cockpit Cam</span>
          <X className="size-3.5 ml-1" />
        </button>
      </div>

      {/* Center Flight Crosshair & Pitch Reticle */}
      <div className="flex flex-col items-center justify-center pointer-events-none">
        <div className="relative flex size-40 items-center justify-center opacity-70 sm:size-48">
          {/* Artificial Horizon lines */}
          <div className="absolute inset-x-0 h-px bg-white/20" />
          <div className="absolute inset-y-0 w-px bg-white/20" />
          <div className="size-24 rounded-full border border-dashed border-white/30" />
          <div className="size-8 rounded-full border border-cyan-400/60" />
          <div className="size-1.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400" />

          {/* Pitch Ladder Marks */}
          <div className="absolute -top-6 font-mono text-[9px] font-bold text-neutral-400 tracking-widest">
            HORIZON +10°
          </div>
          <div className="absolute -bottom-6 font-mono text-[9px] font-bold text-cyan-400/80 tracking-widest">
            EARTH NADIR -30°
          </div>
        </div>
      </div>

      {/* Bottom Telemetry HUD & Simulation Multiplier */}
      <div className="flex flex-col sm:flex-row items-end sm:items-center justify-between gap-3">
        {/* Left Telemetry Cluster */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-[3px] border border-white/25 bg-[#08080a]/90 p-2 shadow-2xl backdrop-blur-xl">
          <div className="rounded-[2px] border border-white/10 bg-white/[0.04] px-2.5 py-1">
            <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
              Altitude
            </div>
            <div className="font-mono text-sm font-bold text-white tabular-nums">
              {alt != null ? formatAltitude(alt) : "---"}
            </div>
          </div>

          <div className="rounded-[2px] border border-white/10 bg-white/[0.04] px-2.5 py-1">
            <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
              Ground Velocity
            </div>
            <div className="font-mono text-sm font-bold text-white tabular-nums">
              {vel != null ? formatVelocity(vel) : "---"}
              {vel != null && (
                <span className="ml-1 text-xs font-normal text-neutral-400">
                  ({formatVelocityKmh(vel)})
                </span>
              )}
            </div>
          </div>

          <div className="rounded-[2px] border border-white/10 bg-white/[0.04] px-2.5 py-1">
            <div className="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
              Inclination
            </div>
            <div className="font-mono text-sm font-bold text-white tabular-nums">
              {snapshot ? formatDegrees(snapshot.inclinationDeg) : "---"}
            </div>
          </div>
        </div>

        {/* Right Speed Booster Controls (to watch Earth rush past rapidly!) */}
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-[3px] border border-white/25 bg-[#08080a]/90 p-1.5 shadow-2xl backdrop-blur-xl">
          <span className="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-neutral-400">
            SPEED:
          </span>
          <button
            onClick={() => {
              setLive(true);
              useSatelliteStore.getState().setRunning(true);
            }}
            className={cn(
              "rounded-[2px] px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors",
              isLive
                ? "bg-cyan-400 text-black shadow-xs"
                : "text-neutral-400 hover:bg-white/10 hover:text-white"
            )}
          >
            1x Live
          </button>
          <button
            onClick={() => {
              setLive(false);
              setMultiplier(10);
              useSatelliteStore.getState().setRunning(true);
            }}
            className={cn(
              "rounded-[2px] px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors",
              !isLive && multiplier === 10
                ? "bg-cyan-400 text-black shadow-xs"
                : "text-neutral-400 hover:bg-white/10 hover:text-white"
            )}
          >
            10x
          </button>
          <button
            onClick={() => {
              setLive(false);
              setMultiplier(60);
              useSatelliteStore.getState().setRunning(true);
            }}
            className={cn(
              "rounded-[2px] px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors",
              !isLive && multiplier === 60
                ? "bg-cyan-400 text-black shadow-xs"
                : "text-neutral-400 hover:bg-white/10 hover:text-white"
            )}
          >
            60x
          </button>
          <button
            onClick={() => {
              setLive(false);
              setMultiplier(300);
              useSatelliteStore.getState().setRunning(true);
            }}
            className={cn(
              "rounded-[2px] px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors",
              !isLive && multiplier === 300
                ? "bg-cyan-400 text-black shadow-xs"
                : "text-neutral-400 hover:bg-white/10 hover:text-white"
            )}
          >
            300x Warp
          </button>
        </div>
      </div>
    </div>
  );
}
