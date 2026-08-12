"use client";

import { useState } from "react";
import { Layers, X } from "lucide-react";
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
      className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/[0.05]"
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-neutral-100">{label}</div>
        <div className="truncate text-[11px] text-neutral-500">{hint}</div>
      </div>
      <span
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
          on ? "bg-white" : "bg-white/15"
        )}
      >
        <span
          className={cn(
            "inline-block size-3.5 rounded-full shadow transition-transform",
            on ? "translate-x-[18px] bg-black" : "translate-x-[3px] bg-white"
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

  return (
    <section className="pointer-events-none absolute right-4 top-4 z-10 flex flex-col items-end gap-2 sm:right-5 sm:top-5">
      {open && (
        <div className="pointer-events-auto w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-[#0b0b0d]/85 p-2 shadow-2xl shadow-black/60 backdrop-blur-md">
          <div className="flex items-center justify-between pb-1 pl-3 pr-1 pt-1">
            <h2 className="text-sm font-semibold text-white">Earth &amp; Map</h2>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close Earth & Map controls"
              className="flex size-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-1 space-y-0.5 pb-1">
            <ToggleRow
              label="Earth imagery"
              hint="Natural satellite imagery"
              on={showEarthImg}
              onChange={setShowEarthImg}
            />
            <ToggleRow
              label="Country borders"
              hint="Borders and country names"
              on={showBorders}
              onChange={setShowBorders}
            />
            <ToggleRow
              label="Lat/Long grid"
              hint="Subtle graticule overlay"
              on={showGrid}
              onChange={setShowGrid}
            />
            <ToggleRow
              label="City & place labels"
              hint="Population-center labels"
              on={showCities}
              onChange={setShowCities}
            />
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={
          open ? "Hide Earth & Map controls" : "Show Earth & Map controls"
        }
        className={cn(
          "pointer-events-auto flex size-10 items-center justify-center rounded-2xl border shadow-2xl backdrop-blur-md transition-colors",
          open
            ? "border-white/30 bg-white/15 text-white"
            : "border-white/10 bg-[#0b0b0d]/80 text-neutral-300 hover:text-white"
        )}
      >
        <Layers className="size-4.5" />
      </button>
    </section>
  );
}