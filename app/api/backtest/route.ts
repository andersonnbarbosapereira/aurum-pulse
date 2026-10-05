import { NextRequest, NextResponse } from "next/server";
import { getHistoricalPrices, resolveGoldEpic } from "@/lib/capital";
import { runBacktest } from "@/lib/backtest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function clampDays(value: string | null) {
  const n = Number(value ?? 7);
  if (!Number.isFinite(n)) return 7;
  return Math.max(3, Math.min(30, Math.floor(n)));
}

export async function GET(request: NextRequest) {
  try {
    const days = clampDays(request.nextUrl.searchParams.get("days"));
    const epic = await resolveGoldEpic();
    const end = new Date();
    const start = new Date(end.getTime() - days * 86_400_000);
    const chunks: any[] = [];

    // 3-day windows keep M5 responses below Capital.com's 1000-value limit.
    for (let cursor = start.getTime(); cursor < end.getTime(); cursor += 3 * 86_400_000) {
      const from = new Date(cursor);
      const to = new Date(Math.min(cursor + 3 * 86_400_000 - 1, end.getTime()));
      const part = await getHistoricalPrices(epic, "MINUTE_5", from, to, 1000);
      chunks.push(...part);
    }

    const seen = new Map<string, any>();
    for (const candle of chunks) {
      const key = String(candle?.snapshotTimeUTC ?? candle?.snapshotTime ?? Math.random());
      seen.set(key, candle);
    }

    const result = runBacktest([...seen.values()]);
    return NextResponse.json({
      mode: "historical-real-data",
      source: "Capital.com",
      epic,
      requestedDays: days,
      ...result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    return NextResponse.json(
      { status: "unavailable", error: "Backtest could not be completed.", diagnostic: message },
      { status: 502 }
    );
  }
}
