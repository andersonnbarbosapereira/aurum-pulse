import { NextRequest, NextResponse } from "next/server";
import { getHistoricalPrices, resolveGoldEpic } from "@/lib/capital";
import { runBacktest } from "@/lib/backtest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function clampDays(value: string | null) {
  const n = Number(value ?? 30);
  if (!Number.isFinite(n)) return 30;
  return Math.max(7, Math.min(120, Math.floor(n)));
}

export async function GET(request: NextRequest) {
  try {
    const days = clampDays(request.nextUrl.searchParams.get("days"));
    const epic = await resolveGoldEpic();
    const end = new Date();
    const start = new Date(end.getTime() - days * 86_400_000);
    const windows: Array<{ from: Date; to: Date }> = [];

    // 3-day windows keep M5 responses below Capital.com's per-request candle cap.
    for (let cursor = start.getTime(); cursor < end.getTime(); cursor += 3 * 86_400_000) {
      windows.push({
        from: new Date(cursor),
        to: new Date(Math.min(cursor + 3 * 86_400_000 - 1, end.getTime()))
      });
    }

    const chunks: any[] = [];
    // Small batches avoid a burst of broker requests while keeping a 90-120 day run practical.
    for (let i = 0; i < windows.length; i += 4) {
      const batch = windows.slice(i, i + 4);
      const parts = await Promise.all(batch.map(w => getHistoricalPrices(epic, "MINUTE_5", w.from, w.to, 1000)));
      for (const part of parts) chunks.push(...part);
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
