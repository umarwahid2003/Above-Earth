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
      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
    >
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-100">{label}</div>
        <div className="truncate font-mono text-[10px] text-neutral-500">{hint}</div>
      </div>
      <span
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
          on ? "border-sky-300/70 bg-sky-300" : "border-white/15 bg-white/10"
        )}
      >
        <span
          className={cn(
            "inline-block size-3.5 rounded-full shadow-sm transition-transform",
            on ? "translate-x-[18px] bg-slate-950" : "translate-x-[3px] bg-slate-300"
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
        <div className="glass-panel pointer-events-auto w-64 max-w-[calc(100vw-2rem)] rounded-2xl p-2.5">
          <div className="flex items-center justify-between pb-1 pl-2 pr-1 pt-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white">Earth &amp; Map Layers</h2>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close Earth & Map controls"
              className="flex size-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
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
          className="glass-panel pointer-events-auto flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold uppercase tracking-wider text-slate-300 transition-all hover:border-sky-300/30 hover:bg-sky-300/10 hover:text-white active:scale-95"
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
            "glass-panel pointer-events-auto flex size-10 items-center justify-center rounded-xl transition-all",
            open
              ? "border-sky-300/50 bg-sky-300/15 text-sky-200"
              : "text-slate-300 hover:border-sky-300/30 hover:text-sky-200"
          )}
        >
          <Layers className="size-4.5" />
        </button>
      </div>
    </section>
  );
}
