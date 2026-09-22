"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { Loader2, Satellite } from "lucide-react";
import { useSatelliteStore } from "@/store/satellites";
import type { SatelliteRecord } from "@/lib/types";
import SatellitePanel from "@/components/satellite-panel";
import DetailPanel from "@/components/detail-panel";
import MapControl from "@/components/map-controls";
import DataStatus from "@/components/data-status";
import OrbitPathControl from "@/components/orbit-path-control";
import TransportControls from "@/components/transport-controls";
import CockpitHud from "@/components/cockpit-hud";

const CesiumGlobe = dynamic(() => import("@/components/cesium-globe"), {
  ssr: false,
  loading: () => (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#02050a]">
      <div className="absolute size-[min(62vw,62vh)] rounded-full border border-sky-300/10 bg-[radial-gradient(circle_at_35%_30%,rgba(56,189,248,.18),rgba(3,105,161,.07)_38%,rgba(2,6,23,.2)_66%,transparent_67%)] shadow-[0_0_120px_rgba(14,165,233,.08)]" />
      <div className="relative flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/55 px-6 py-4 shadow-2xl backdrop-blur-xl">
        <Loader2 className="size-5 animate-spin text-sky-300" />
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white">Initializing orbital scene</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-400">Loading Earth imagery and SGP4 models</p>
        </div>
      </div>
    </div>
  ),
});

type OrbitalDataPayload = {
  satellites?: unknown[];
  source?: string;
  lastUpdated?: string | null;
  isStale?: boolean;
  updatedCount?: number;
  freshCount?: number;
  staleCount?: number;
  oldestEpoch?: string | null;
  newestEpoch?: string | null;
};

export default function Scene() {
  const ready = useSatelliteStore((state) => state.ready);
  const validCount = useSatelliteStore((state) => state.validCount);
  const selectedId = useSatelliteStore((state) => state.selectedId);
  const catalogMode = useSatelliteStore((state) => state.catalogMode);
  const cameraMode = useSatelliteStore((state) => state.cameraMode);
  const showEmpty = catalogMode === "explore" && ready && validCount === 0;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/satellites", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Satellite feed failed (${response.status})`);
        return response.json();
      })
      .then((data: OrbitalDataPayload) => {
        if (cancelled) return;
        if (data && Array.isArray(data.satellites) && data.satellites.length > 0) {
          const sats = data.satellites as SatelliteRecord[];
          useSatelliteStore.getState().setSatellites(sats);
          useSatelliteStore.getState().setDataMeta({
            source:
              data.source === "celestrak" || data.source === "cache" || data.source === "catalog"
                ? data.source
                : "cache",
            lastUpdated: data.lastUpdated ?? null,
            isStale: data.isStale !== false,
            updatedCount: data.updatedCount ?? 0,
            freshCount: data.freshCount ?? 0,
            staleCount: data.staleCount ?? 0,
            oldestEpoch: data.oldestEpoch ?? null,
            newestEpoch: data.newestEpoch ?? null,
          });

          // Check URL query parameters for deep linked satellite (?norad=25544 or ?id=iss)
          if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const norad = params.get("norad");
            const id = params.get("id");
            if (norad || id) {
              const match = sats.find(
                (s) =>
                  (norad && String(s.noradId) === norad) ||
                  (id && s.id.toLowerCase() === id.toLowerCase())
              );
              if (match) {
                useSatelliteStore.getState().setSelectedId(match.id);
              }
            }
          }
        }
      })
      .catch(() => {
        // Keep the checked-in catalog; the data-status badge explains why.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isPov = cameraMode === "pov";

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#02050a] text-neutral-100">
      <div className="absolute inset-0 z-0">
        <CesiumGlobe />
      </div>

      <div aria-hidden className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_center,transparent_45%,rgba(1,4,10,.2)_78%,rgba(1,3,8,.48)_100%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-32 bg-gradient-to-b from-[#02050a]/55 to-transparent" />

      {!isPov && <SatellitePanel />}
      {!isPov && <MapControl />}
      {!isPov && <DetailPanel />}
      <CockpitHud />

      {!isPov && (
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-3 z-10 flex flex-col items-center gap-1.5 px-3 transition-[right] duration-300 sm:bottom-5 sm:gap-2 ${
            selectedId ? "sm:right-[21rem] lg:right-[23rem]" : "sm:right-0"
          }`}
        >
          <DataStatus />
          <OrbitPathControl />
          <TransportControls />
        </div>
      )}

      {showEmpty && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#050505]/85 p-4">
          <div className="max-w-sm rounded-2xl border border-white/10 bg-[#0b0b0d]/85 p-6 text-center shadow-2xl shadow-black/60 backdrop-blur-md">
            <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
              <Satellite className="size-5 text-neutral-300" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-white">
              No satellites available
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">
              The orbital element catalog could not be parsed or propagated.
              The globe still renders — drag to orbit and scroll to zoom.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
