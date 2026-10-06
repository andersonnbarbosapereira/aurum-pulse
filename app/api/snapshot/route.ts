import { NextResponse } from "next/server";
import { getLiveFinalSnapshot } from "@/lib/live-final-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getLiveFinalSnapshot();
    return NextResponse.json({ mode: "live", source: "Capital.com", data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    const missingCredentials = message === "CAPITAL_CREDENTIALS_MISSING";
    return NextResponse.json(
      {
        mode: "live",
        source: "Capital.com",
        status: missingCredentials ? "configuration_required" : "unavailable",
        error: missingCredentials ? "Capital.com credentials are not configured on the server." : "Market data is temporarily unavailable."
      },
      { status: missingCredentials ? 503 : 502 }
    );
  }
}
