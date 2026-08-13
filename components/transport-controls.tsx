"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Clock, Pause, Play, Radio, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSatelliteStore, SIM_SPEEDS, type SimSpeed } from "@/store/satellites";

function formatUtc(ms: number | null): string {
  if (ms == null) return "–:–:–";
  return `${new Date(ms).toISOString().slice(11, 19)} UTC`;
}

export default function TransportControls() {
  const running = useSatelliteStore((state) => state.running);
  const setRunning = useSatelliteStore((state) => state.setRunning);
  const live = useSatelliteStore((state) => state.live);
  const setLive = useSatelliteStore((state) => state.setLive);
  const multiplier = useSatelliteStore((state) => state.multiplier);
  const setMultiplier = useSatelliteStore((state) => state.setMultiplier);
  const simTimeMs = useSatelliteStore((state) => state.liveMetrics.simTimeMs);

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!popoverOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [popoverOpen]);

  const returnToLive = () => {
    setLive(true);
    setPopoverOpen(false);
  };

  const enterSim = (speed: SimSpeed) => {
    setLive(false);
    setMultiplier(speed);
    setPopoverOpen(false);
  };

  const toggleRunning = () => setRunning(!running);

  return (
    <>
      <div className="pointer-events-auto flex items-center gap-1 rounded-[3px] border border-white/20 bg-[#08080a]/90 px-1.5 py-1 shadow-2xl shadow-black/80 backdrop-blur-xl">
        <button
          onClick={toggleRunning}
          aria-label={
            live
              ? running
                ? "Pause live view"
                : "Resume live view"
              : running
                ? "Pause simulation"
                : "Resume simulation"
          }
          className={cn(
            "flex size-8 items-center justify-center rounded-[2px] transition-colors",
            running
              ? "text-neutral-300 hover:bg-white/10 hover:text-white"
              : "bg-white/20 text-white hover:bg-white/30"
          )}
        >
          {running ? (
            <Pause className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
        </button>

        <div className="mx-0.5 h-4 w-px bg-white/15" />

        {live ? (
          <button
            onClick={returnToLive}
            aria-pressed={live}
            aria-label="LIVE NOW — showing current UTC time"
            className="flex items-center gap-2 rounded-[2px] bg-white px-2.5 py-1 text-black shadow-xs"
          >
            <Radio className="size-3 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-widest">LIVE NOW</span>
            <span className="font-mono text-[11px] font-semibold tabular-nums">
              {formatUtc(now)}
            </span>
          </button>
        ) : (
          <button
            onClick={returnToLive}
            aria-label="Simulation mode — return to LIVE NOW"
            className="flex items-center gap-2 rounded-[2px] bg-white/15 px-2.5 py-1 text-white shadow-xs"
          >
            <Clock className="size-3" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Simulation</span>
            <span className="font-mono text-[11px] font-bold tabular-nums">
              {multiplier}x
            </span>
            <span className="font-mono text-[11px] text-neutral-400">
              {formatUtc(simTimeMs)}
            </span>
          </button>
        )}

        <div className="mx-0.5 h-4 w-px bg-white/15" />

        <div ref={popoverRef} className="relative">
          <button
            onClick={() => setPopoverOpen((open) => !open)}
            aria-expanded={popoverOpen}
            aria-label="Simulation speed options"
            className="flex items-center gap-1 rounded-[2px] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Clock className="size-3" />
            <ChevronDown
              className={cn(
                "size-2.5 transition-transform",
                popoverOpen && "rotate-180"
              )}
            />
          </button>

          {popoverOpen && (
            <div className="absolute bottom-full right-0 mb-2 w-60 rounded-[3px] border border-white/20 bg-[#08080a]/95 p-2 shadow-2xl shadow-black/80 backdrop-blur-xl">
              <p className="px-1.5 pb-0.5 pt-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
                Simulation Speed
              </p>
              <p className="px-1.5 pb-2 text-[10px] text-neutral-400">
                Orbital trajectory prediction.
              </p>
              <div className="flex gap-1 px-0.5 pb-0.5">
                {SIM_SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    onClick={() => enterSim(speed)}
                    className={cn(
                      "flex-1 rounded-[2px] px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors",
                      !live && multiplier === speed
                        ? "bg-white text-black"
                        : "bg-white/[0.06] text-neutral-300 hover:bg-white/15 hover:text-white"
                    )}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {!live && (
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-[3px] border border-white/20 bg-[#08080a]/90 px-3 py-1 shadow-2xl shadow-black/80 backdrop-blur-xl">
          <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-300">
            PREDICTED ORBIT
          </span>
          <span className="font-mono text-[11px] text-neutral-400 tabular-nums">
            {formatUtc(simTimeMs)}
          </span>
          <button
            onClick={returnToLive}
            className="flex items-center gap-1 rounded-[2px] bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black transition-opacity hover:opacity-80"
          >
            <RotateCcw className="size-2.5" />
            LIVE
          </button>
        </div>
      )}

      <p className="pointer-events-none text-center font-mono text-[10px] uppercase tracking-wider text-neutral-500">
        ORBITAL PROPAGATION VIA SGP4 · REAL-TIME ECF
      </p>
    </>
  );
}
