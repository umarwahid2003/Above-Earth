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
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-[3px] border border-white/20 bg-[#08080a]/90 px-2.5 py-1 shadow-2xl shadow-black/80 backdrop-blur-xl">
        <span className="flex items-center gap-1 pr-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
          <Orbit className="size-3 text-white" />
          ORBIT PATHS
        </span>
        <div className="h-3.5 w-px bg-white/15" />
        {MODES.map((mode) => (
          <button
            key={mode.value}
            onClick={() => setOrbitMode(mode.value)}
            aria-pressed={orbitMode === mode.value}
            className={cn(
              "rounded-[2px] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
              orbitMode === mode.value
                ? "bg-white text-black shadow-xs"
                : "text-neutral-400 hover:bg-white/[0.08] hover:text-white"
            )}
          >
            {mode.label}
          </button>
        ))}
      </div>
      {orbitMode === "all" && (
        <p className="pointer-events-none text-center font-mono text-[10px] uppercase tracking-wider text-neutral-500">
          {visibleCount} ACTIVE TRAJECTORIES PROPAGATED
        </p>
      )}
    </div>
  );
}