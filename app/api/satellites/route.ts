import { after, NextResponse } from "next/server";
import {
  getBundledSatellites,
  getSatellites,
} from "@/lib/orbital-data";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const COLD_START_BUDGET_MS = 1_200;

export async function GET() {
  try {
    const liveData = getSatellites();
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    const fastFallback = new Promise<ReturnType<typeof getBundledSatellites>>(
      (resolve) => {
        fallbackTimer = setTimeout(
          () => resolve(getBundledSatellites()),
          COLD_START_BUDGET_MS
        );
      }
    );

    const data = await Promise.race([liveData, fastFallback]);
    if (fallbackTimer) clearTimeout(fallbackTimer);

    // Vercel keeps this invocation alive long enough to warm the in-memory
    // catalog without making the first visitor wait for CelesTrak.
    after(async () => {
      await liveData.catch(() => undefined);
    });

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=3600",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to load orbital data." },
      { status: 500 }
    );
  }
}
