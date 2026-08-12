import { NextResponse } from "next/server";
import {
  FullCatalogError,
  getFullCatalog,
} from "@/lib/orbital-data";

export const dynamic = "force-dynamic";

function errorCodeFor(error: unknown) {
  if (error instanceof FullCatalogError) return error.code;
  return "FULL_CATALOG_INTERNAL";
}

export async function GET() {
  try {
    const data = await getFullCatalog();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const code = errorCodeFor(error);
    const message =
      error instanceof Error && error.message.length > 0
        ? error.message
        : "The Full Catalog is unavailable right now. Try again in a few minutes.";
    const cause = error instanceof Error ? error.cause : undefined;

    // Surface the real underlying error in the server logs during
    // development so failures are diagnosable without exposing internals.
    if (process.env.NODE_ENV !== "production") {
      console.error(
        `[full-catalog] ${code}:`,
        error instanceof Error ? error.message : String(error)
      );
      if (cause) console.error(`[full-catalog] cause:`, cause);
    }

    return NextResponse.json(
      {
        error: {
          code,
          message,
          status: 503,
        },
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}