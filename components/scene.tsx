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

const CesiumGlobe = dynamic(() => import("@/components/cesium-globe"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#050505]">
      <Loader2 className="size-8 animate-spin text-neutral-300" />
    </div>
  ),
});

type OrbitalDataPayload = {
  satellites?: unknown[];
  source?: string;
  lastUpdated?: string | null;
  isStale?: boolean;
  updatedCount?: number;
};

export default function Scene() {
  const ready = useSatelliteStore((state) => state.ready);
  const validCount = useSatelliteStore((state) => state.validCount);
  const catalogMode = useSatelliteStore((state) => state.catalogMode);
  const showEmpty = catalogMode === "explore" && ready && validCount === 0;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/satellites", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: OrbitalDataPayload) => {
        if (cancelled) return;
        if (data && Array.isArray(data.satellites) && data.satellites.length > 0) {
          useSatelliteStore
            .getState()
            .setSatellites(data.satellites as SatelliteRecord[]);
          useSatelliteStore.getState().setDataMeta({
            source:
              data.source === "celestrak" || data.source === "cache" || data.source === "catalog"
                ? data.source
                : "cache",
            lastUpdated: data.lastUpdated ?? null,
            isStale: data.isStale !== false,
            updatedCount: data.updatedCount ?? 0,
          });
        }
      })
      .catch(() => {
        // Keep the checked-in catalog; the data-status badge explains why.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#050505] text-neutral-100">
      <div className="absolute inset-0 z-0">
        <CesiumGlobe />
      </div>

      <SatellitePanel />
      <MapControl />
      <DetailPanel />

      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex flex-col items-center gap-2">
        <DataStatus />
        <OrbitPathControl />
        <TransportControls />
      </div>

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