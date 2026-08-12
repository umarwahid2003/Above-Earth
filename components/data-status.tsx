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
          : "Loading full catalog";
      return (
        <p className="pointer-events-none flex items-center justify-center gap-1.5 text-center text-[11px] text-neutral-500">
          <Radio className="size-3 shrink-0 text-neutral-200" />
          <span className="text-neutral-200">{stageLabel}</span>
          <span>· from CelesTrak</span>
        </p>
      );
    }
    if (fullCatalogStatus === "error") {
      return (
        <p className="pointer-events-none flex items-center justify-center gap-1.5 text-center text-[11px] text-neutral-500">
          <CloudOff className="size-3 shrink-0 text-neutral-400" />
          <span className="text-neutral-300">Full catalog unavailable</span>
          <span>· retry from the browser</span>
        </p>
      );
    }
    if (fullCatalogStatus === "ready" && fullCatalogSource) {
      const fullRelative = formatRelative(fullCatalogUpdated, now);
      return (
        <p className="pointer-events-none flex items-center justify-center gap-1.5 text-center text-[11px] text-neutral-500">
          <Radio className="size-3 shrink-0 text-neutral-200" />
          <span className="text-neutral-200">
            Full catalog · {fullCatalogCount.toLocaleString("en-US")} active
          </span>
          <span>
            · {fullCatalogSource === "celestrak" ? "from CelesTrak" : "cached"}
            {fullRelative ? `, updated ${fullRelative}` : ""}
          </span>
        </p>
      );
    }
    return null;
  }

  const relative = formatRelative(lastUpdated, now);

  if (source === "celestrak") {
    return (
      <p className="pointer-events-none flex items-center justify-center gap-1.5 text-center text-[11px] text-neutral-500">
        <Radio className="size-3 shrink-0 text-neutral-200" />
        <span className="text-neutral-200">Live elements</span>
        <span>· from CelesTrak, updated {relative}</span>
      </p>
    );
  }

  const storedSource = source === "cache" ? "cached" : "bundled catalog";

  return (
    <p className="pointer-events-none flex items-center justify-center gap-1.5 text-center text-[11px] text-neutral-500">
      <CloudOff className="size-3 shrink-0 text-neutral-400" />
      <span className="text-neutral-300">
        Using {storedSource} orbital data
      </span>
      {isStale && <span className="text-neutral-400">(stale)</span>}
      {relative && <span>· updated {relative}</span>}
    </p>
  );
}
