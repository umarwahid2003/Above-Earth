"use client";

import { useState } from "react";
import { Layers, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSatelliteStore } from "@/store/satellites";

function ToggleRow({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      className="flex w-full items-center justify-between gap-3 rounded-[2px] px-2.5 py-1.5 text-left transition-colors hover:bg-white/[0.06]"
    >
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-100">{label}</div>
        <div className="truncate font-mono text-[10px] text-neutral-500">{hint}</div>
      </div>
      <span
        className={cn(
          "relative inline-flex h-4 w-7 shrink-0 items-center rounded-[2px] transition-colors",
          on ? "bg-white" : "bg-white/20"
        )}
      >
        <span
          className={cn(
            "inline-block size-3 rounded-[1px] shadow-xs transition-transform",
            on ? "translate-x-[14px] bg-black" : "translate-x-[2px] bg-white"
          )}
        />
      </span>
    </button>
  );
}

export default function MapControl() {
  const [open, setOpen] = useState(false);
  const showEarthImg = useSatelliteStore((state) => state.showEarthImg);
  const setShowEarthImg = useSatelliteStore((state) => state.setShowEarthImg);
  const showBorders = useSatelliteStore((state) => state.showBorders);
  const setShowBorders = useSatelliteStore((state) => state.setShowBorders);
  const showGrid = useSatelliteStore((state) => state.showGrid);
  const setShowGrid = useSatelliteStore((state) => state.setShowGrid);
  const showCities = useSatelliteStore((state) => state.showCities);
  const setShowCities = useSatelliteStore((state) => state.setShowCities);
  const resetAll = useSatelliteStore((state) => state.resetAll);

  return (
    <section className="pointer-events-none absolute right-4 top-4 z-10 flex flex-col items-end gap-2 sm:right-5 sm:top-5">
      {open && (
        <div className="pointer-events-auto w-60 max-w-[calc(100vw-2rem)] rounded-[4px] border border-white/20 bg-[#08080a]/90 p-2 shadow-2xl shadow-black/80 backdrop-blur-xl">
          <div className="flex items-center justify-between pb-1 pl-2 pr-1 pt-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white">Earth &amp; Map Layers</h2>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close Earth & Map controls"
              className="flex size-6 items-center justify-center rounded-[2px] text-neutral-400 transition-colors hover:bg-white/15 hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="mt-1 space-y-0.5 pb-1">
            <ToggleRow
              label="Earth imagery"
              hint="Natural satellite texture"
              on={showEarthImg}
              onChange={setShowEarthImg}
            />
            <ToggleRow
              label="Country borders"
              hint="Boundaries & geopolitical"
              on={showBorders}
              onChange={setShowBorders}
            />
            <ToggleRow
              label="Lat/Long grid"
              hint="Coordinate graticule"
              on={showGrid}
              onChange={setShowGrid}
            />
            <ToggleRow
              label="City & place labels"
              hint="Major population centers"
              on={showCities}
              onChange={setShowCities}
            />
          </div>
        </div>
      )}

      {/* Top Controls Action Bar */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => resetAll()}
          title="Reset to initial global overview, clear selections and filters"
          aria-label="Reset application state to initial overview"
          className="pointer-events-auto flex h-10 items-center gap-1.5 rounded-[3px] border border-white/20 bg-[#08080a]/90 px-3 text-xs font-bold uppercase tracking-wider text-neutral-300 shadow-2xl backdrop-blur-xl transition-all hover:border-white/40 hover:bg-white/10 hover:text-white active:scale-95"
        >
          <RotateCcw className="size-3.5" />
          <span className="hidden sm:inline">Reset</span>
        </button>

        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={
            open ? "Hide Earth & Map controls" : "Show Earth & Map controls"
          }
          className={cn(
            "pointer-events-auto flex size-10 items-center justify-center rounded-[3px] border shadow-2xl backdrop-blur-xl transition-all",
            open
              ? "border-white/40 bg-white/20 text-white"
              : "border-white/20 bg-[#08080a]/90 text-neutral-300 hover:border-white/40 hover:text-white"
          )}
        >
          <Layers className="size-4.5" />
        </button>
      </div>
    </section>
  );
}