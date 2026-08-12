"use client";

import { useMemo } from "react";
import { Orbit } from "lucide-react";
import { cn } from "@/lib/utils";
import { filterSatellites, type OrbitPathMode } from "@/lib/filter";
import { useSatelliteStore } from "@/store/satellites";

const MODES: { value: OrbitPathMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "selected", label: "Selected" },
  { value: "all", label: "All" },
];

export default function OrbitPathControl() {
  const orbitMode = useSatelliteStore((state) => state.orbitMode);
  const setOrbitMode = useSatelliteStore((state) => state.setOrbitMode);
  const satellites = useSatelliteStore((state) => state.satellites);
  const query = useSatelliteStore((state) => state.query);
  const category = useSatelliteStore((state) => state.category);
  const catalogMode = useSatelliteStore((state) => state.catalogMode);

  const visibleCount = useMemo(
    () => filterSatellites(satellites, query, category).length,
    [satellites, query, category]
  );

  if (catalogMode === "full") return null;

  return (
    <div className="pointer-events-none flex flex-col items-center gap-1.5">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-[#0b0b0d]/80 px-3 py-1.5 shadow-2xl shadow-black/60 backdrop-blur-md">
        <span className="flex items-center gap-1.5 pr-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
          <Orbit className="size-3.5 text-neutral-400" />
          Orbit paths
        </span>
        <div className="h-4 w-px bg-white/10" />
        {MODES.map((mode) => (
          <button
            key={mode.value}
            onClick={() => setOrbitMode(mode.value)}
            aria-pressed={orbitMode === mode.value}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
              orbitMode === mode.value
                ? "bg-white text-black"
                : "text-neutral-500 hover:bg-white/[0.07] hover:text-neutral-200"
            )}
          >
            {mode.label}
          </button>
        ))}
      </div>
      {orbitMode === "all" && (
        <p className="pointer-events-none text-center text-[11px] text-neutral-500">
          Showing paths for {visibleCount} filtered satellite
          {visibleCount === 1 ? "" : "s"} — lower detail to stay smooth.
        </p>
      )}
    </div>
  );
}