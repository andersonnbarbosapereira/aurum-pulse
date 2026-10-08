import { NextResponse } from "next/server";
import { getHistoricalPrices, resolveGoldEpic } from "@/lib/capital";
import { runTrendEngine, trendStats, type Candle } from "@/lib/trend-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// AURUM_TREND_V1 em modo sombra: recalcula sinais e gestão sobre ~1 ano de H1 da Capital.com.
// Não grava no LIVE_V2, não envia Telegram e não envia ordens.
const mid = (v: any) => { const b = Number(v?.bid), a = Number(v?.ask ?? v?.offer); return Number.isFinite(b) && Number.isFinite(a) ? (b + a) / 2 : Number.isFinite(b) ? b : a; };
const g = globalThis as unknown as { __aurumTrend?: { at: number; body: any } };

async function loadH1(epic: string, days: number): Promise<Candle[]> {
  const now = Date.now(), step = 40 * 86_400_000, map = new Map<number, Candle>();
  for (let from = now - days * 86_400_000; from < now; from += step) {
    const raw = await getHistoricalPrices(epic, "HOUR", new Date(from), new Date(Math.min(now, from + step)), 1000);
    for (const r of raw) {
      const s = String(r?.snapshotTimeUTC ?? r?.snapshotTime ?? ""), time = Math.floor(Date.parse(s.endsWith("Z") ? s : s + "Z") / 1000);
      const c = { time, open: mid(r?.openPrice), high: mid(r?.highPrice), low: mid(r?.lowPrice), close: mid(r?.closePrice) };
      if (Number.isFinite(time) && [c.open, c.high, c.low, c.close].every(Number.isFinite)) map.set(time, c);
    }
  }
  // só candles FECHADOS
  return [...map.values()].filter((c) => c.time + 3600 <= now / 1000).sort((a, b) => a.time - b.time);
}

export async function GET() {
  try {
    if (g.__aurumTrend && Date.now() - g.__aurumTrend.at < 55_000) return NextResponse.json(g.__aurumTrend.body, { headers: { "Cache-Control": "no-store" } });
    const epic = await resolveGoldEpic();
    const h1 = await loadH1(epic, 365);
    const { state, trades } = runTrendEngine(h1);
    const active = trades.filter((t) => t.status === "ABERTA");
    const closed = trades.filter((t) => t.status === "ENCERRADA");
    const body = {
      engine: "AURUM_TREND_V1", mode: "SOMBRA", source: "Capital.com", epic, candlesH1: h1.length,
      from: h1[0] ? new Date(h1[0].time * 1000).toISOString() : null,
      state, active, recent: closed.slice(-12).reverse(), stats: trendStats(trades),
      byModule: { ROMPIMENTO_H1: trendStats(trades.filter((t) => t.module === "ROMPIMENTO_H1")), ROMPIMENTO_H4: trendStats(trades.filter((t) => t.module === "ROMPIMENTO_H4")) },
      note: "Resultados em R sem custo (spread não descontado). Recalculado a partir dos candles; execução manual.",
    };
    g.__aurumTrend = { at: Date.now(), body };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ status: "unavailable", diagnostic: e instanceof Error ? e.message : "UNKNOWN_ERROR" }, { status: 502 });
  }
}
