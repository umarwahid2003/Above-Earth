import { NextResponse } from "next/server";
import { getSatellites } from "@/lib/orbital-data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getSatellites();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to load orbital data." },
      { status: 500 }
    );
  }
}