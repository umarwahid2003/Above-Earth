"use client";

import { useEffect, useState } from "react";
import { CloudOff, Radio } from "lucide-react";
import { useSatelliteStore, type FullCatalogStage } from "@/store/satellites";

const STAGE_LABEL: Record<Exclude<FullCatalogStage, "done">, string> = {
  downloading: "Downloading catalog",
  processing: "Processing records",
  rendering: "Rendering objects",
};

function formatRelative(iso: string | null, nowMs: number): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const seconds = Math.max(0, Math.round((nowMs - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export default function DataStatus() {
  const source = useSatelliteStore((state) => state.dataSource);
  const lastUpdated = useSatelliteStore((state) => state.lastUpdated);
  const isStale = useSatelliteStore((state) => state.isStale);
  const catalogMode = useSatelliteStore((state) => state.catalogMode);
  const fullCatalogStatus = useSatelliteStore(
    (state) => state.fullCatalogStatus
  );
  const fullCatalogSource = useSatelliteStore(
    (state) => state.fullCatalogSource
  );
  const fullCatalogUpdated = useSatelliteStore(
    (state) => state.fullCatalogUpdated
  );
  const fullCatalogCount = useSatelliteStore((state) => state.fullCatalogCount);
  const fullCatalogStage = useSatelliteStore((state) => state.fullCatalogStage);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  if (catalogMode === "full") {
    if (fullCatalogStatus === "loading") {
      const stageLabel =
        fullCatalogStage && fullCatalogStage !== "done"
          ? STAGE_LABEL[fullCatalogStage]
          : "LOADING FULL CATALOG";
      return (
        <p className="pointer-events-none flex items-center justify-center gap-1.5 text-center font-mono text-[10px] uppercase tracking-wider text-neutral-400">
          <Radio className="size-3 shrink-0 text-white animate-pulse" />
          <span className="font-bold text-white">{stageLabel}</span>
          <span>· CELESTRAK FEED</span>
        </p>
      );
    }
    if (fullCatalogStatus === "error") {
      return (
        <p className="pointer-events-none flex items-center justify-center gap-1.5 text-center font-mono text-[10px] uppercase tracking-wider text-neutral-400">
          <CloudOff className="size-3 shrink-0 text-red-400" />
          <span className="font-semibold text-red-300">FULL CATALOG OFFLINE</span>
          <span>· RETRY FROM PANEL</span>
        </p>
      );
    }
    if (fullCatalogStatus === "ready" && fullCatalogSource) {
      const fullRelative = formatRelative(fullCatalogUpdated, now);
      return (
        <p className="pointer-events-none flex items-center justify-center gap-1.5 text-center font-mono text-[10px] uppercase tracking-wider text-neutral-400">
          <Radio className="size-3 shrink-0 text-white" />
          <span className="font-bold text-white">
            CATALOG · {fullCatalogCount.toLocaleString("en-US")} ACTIVE
          </span>
          <span>
            · {fullCatalogSource === "celestrak" ? "CELESTRAK" : "CACHED"}
            {fullRelative ? ` (${fullRelative})` : ""}
          </span>
        </p>
      );
    }
    return null;
  }

  const relative = formatRelative(lastUpdated, now);

  if (source === "celestrak") {
    return (
      <p className="pointer-events-none flex items-center justify-center gap-1.5 text-center font-mono text-[10px] uppercase tracking-wider text-neutral-400">
        <Radio className="size-3 shrink-0 text-white" />
        <span className="font-bold text-white">LIVE TELEMETRY</span>
        <span>· CELESTRAK ({relative})</span>
      </p>
    );
  }

  const storedSource = source === "cache" ? "CACHED" : "BUNDLED";

  return (
    <p className="pointer-events-none flex items-center justify-center gap-1.5 text-center font-mono text-[10px] uppercase tracking-wider text-neutral-400">
      <CloudOff className="size-3 shrink-0 text-neutral-400" />
      <span className="font-bold text-neutral-200">
        {storedSource} ORBITAL SNAPSHOT
      </span>
      {isStale && <span className="text-neutral-500">(STALE)</span>}
      {relative && <span>· {relative}</span>}
    </p>
  );
}
