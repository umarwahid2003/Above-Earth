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
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-[#0b0b0d]/80 px-2 py-1.5 shadow-2xl shadow-black/60 backdrop-blur-md">
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
            "flex size-9 items-center justify-center rounded-full transition-colors",
            running
              ? "text-neutral-200 hover:bg-white/10"
              : "bg-white/15 text-white hover:bg-white/25"
          )}
        >
          {running ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
        </button>

        <div className="mx-1 h-5 w-px bg-white/10" />

        {live ? (
          <button
            onClick={returnToLive}
            aria-pressed={live}
            aria-label="LIVE NOW — showing current UTC time"
            className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-black"
          >
            <Radio className="size-3.5 animate-pulse" />
            <span className="text-[11px] font-bold tracking-wide">LIVE NOW</span>
            <span className="font-mono text-[11px] tabular-nums">
              {formatUtc(now)}
            </span>
          </button>
        ) : (
          <button
            onClick={returnToLive}
            aria-label="Simulation mode — return to LIVE NOW"
            className="flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-white"
          >
            <Clock className="size-3.5" />
            <span className="text-[11px] font-semibold">Simulation</span>
            <span className="font-mono text-[11px] tabular-nums">
              {multiplier}x
            </span>
            <span className="font-mono text-[11px] text-neutral-400">
              {formatUtc(simTimeMs)}
            </span>
          </button>
        )}

        <div className="mx-1 h-5 w-px bg-white/10" />

        <div ref={popoverRef} className="relative">
          <button
            onClick={() => setPopoverOpen((open) => !open)}
            aria-expanded={popoverOpen}
            aria-label="Simulation speed options"
            className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-medium text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200"
          >
            <Clock className="size-3.5" />
            <ChevronDown
              className={cn(
                "size-3 transition-transform",
                popoverOpen && "rotate-180"
              )}
            />
          </button>

          {popoverOpen && (
            <div className="absolute bottom-full right-0 mb-2 w-64 rounded-2xl border border-white/10 bg-[#0b0b0d]/90 p-2 shadow-2xl shadow-black/60 backdrop-blur-md">
              <p className="px-2 pb-1 pt-1 text-[12px] font-semibold text-white">
                Simulation speed
              </p>
              <p className="px-2 pb-2 text-[11px] text-neutral-500">
                Predict future orbit — not live tracking.
              </p>
              <div className="flex gap-1.5 px-1 pb-1">
                {SIM_SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    onClick={() => enterSim(speed)}
                    className={cn(
                      "flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors",
                      !live && multiplier === speed
                        ? "bg-white text-black"
                        : "bg-white/[0.05] text-neutral-300 hover:bg-white/10"
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
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-full border border-white/15 bg-[#0b0b0d]/85 px-3 py-1.5 shadow-2xl shadow-black/60 backdrop-blur-md">
          <span className="text-[11px] text-neutral-200">
            Simulation mode — showing predicted future positions.
          </span>
          <span className="font-mono text-[11px] text-neutral-400 tabular-nums">
            {formatUtc(simTimeMs)}
          </span>
          <button
            onClick={returnToLive}
            className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-black transition-opacity hover:opacity-80"
          >
            <RotateCcw className="size-3" />
            Return to Live Now
          </button>
        </div>
      )}

      <p className="pointer-events-none text-center text-[11px] text-neutral-500">
        Positions are calculated from recent orbital elements, not live
        telemetry.
      </p>
    </>
  );
}
