import { NextResponse } from "next/server";
import { getDemoSnapshot } from "@/lib/market";

export function GET() {
  return NextResponse.json({
    mode: "demo",
    data: getDemoSnapshot()
  });
}
