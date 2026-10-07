import { NextResponse } from "next/server";
import { getHistDataXauM15 } from "@/lib/histdata-holdout";
import { runSessionFlowLab } from "@/lib/session-flow-lab";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const year = Number(u.searchParams.get("year") || "2023");
    const data = await getHistDataXauM15(year);
    const lab: any = runSessionFlowLab(data.candlesM15, 180);

    if (lab.status !== "ok") {
      return NextResponse.json({ source: "HistData", year, ...lab }, { status: 502 });
    }

    const frozen = {
      ROUTER20: lab.variants?.ROUTER20 ?? null,
      ROUTER20_BLEND60: lab.variants?.ROUTER20_BLEND60 ?? null,
      ROUTER20_EDGE60: lab.variants?.ROUTER20_EDGE60 ?? null,
      EDGE60_TREND20: lab.variants?.EDGE60_TREND20 ?? null,
      SESSION20_TREND20: lab.variants?.SESSION20_TREND20 ?? null,
      DUAL20_TREND20: lab.variants?.DUAL20_TREND20 ?? null
    };

    return NextResponse.json({
      mode: "histdata-session-holdout",
      source: "HistData.com Generic ASCII M1 bid bars",
      year,
      timeConversion: "HistData fixed EST (UTC-5, no DST) converted to UTC before M1->M15 aggregation",
      zipBytes: data.zipBytes,
      sourceRowsM1: data.sourceRowsM1,
      candlesM15: data.candlesM15.length,
      evaluationFrom: lab.evaluationFrom,
      to: lab.to,
      capitalSelectedCandidates: ["ROUTER20", "ROUTER20_BLEND60", "ROUTER20_EDGE60", "EDGE60_TREND20", "SESSION20_TREND20", "DUAL20_TREND20"],
      cost: lab.cost,
      results: frozen,
      holdoutGate: {
        ROUTER20:
          !!frozen.ROUTER20 &&
          frozen.ROUTER20.totalReturnPct > 0 &&
          frozen.ROUTER20.profitFactor >= 1.03 &&
          frozen.ROUTER20.avgTradeBps > 0,
        ROUTER20_BLEND60:
          !!frozen.ROUTER20_BLEND60 &&
          frozen.ROUTER20_BLEND60.totalReturnPct > 0 &&
          frozen.ROUTER20_BLEND60.profitFactor >= 1.05 &&
          frozen.ROUTER20_BLEND60.avgTradeBps > 0,
        ROUTER20_EDGE60:
          !!frozen.ROUTER20_EDGE60 &&
          frozen.ROUTER20_EDGE60.totalReturnPct > 0 &&
          frozen.ROUTER20_EDGE60.profitFactor >= 1.08 &&
          frozen.ROUTER20_EDGE60.avgTradeBps > 0,
        EDGE60_TREND20:
          !!frozen.EDGE60_TREND20 &&
          frozen.EDGE60_TREND20.totalReturnPct > 0 &&
          frozen.EDGE60_TREND20.profitFactor >= 1.15 &&
          frozen.EDGE60_TREND20.avgTradeBps > 0,
        SESSION20_TREND20:
          !!frozen.SESSION20_TREND20 &&
          frozen.SESSION20_TREND20.totalReturnPct > 0 &&
          frozen.SESSION20_TREND20.profitFactor >= 1.15 &&
          frozen.SESSION20_TREND20.avgTradeBps > 0,
        DUAL20_TREND20:
          !!frozen.DUAL20_TREND20 &&
          frozen.DUAL20_TREND20.totalReturnPct > 0 &&
          frozen.DUAL20_TREND20.profitFactor >= 1.15 &&
          frozen.DUAL20_TREND20.avgTradeBps > 0
      },
      warning: "Untouched pre-2024 holdout. Do not retune these candidates after inspecting this result; use additional older years only as confirmation with the same frozen rules."
    }, {
      headers: { "X-Robots-Tag": "noindex", "Cache-Control": "no-store" }
    });
  } catch (e) {
    return NextResponse.json({
      status: "unavailable",
      diagnostic: e instanceof Error ? e.message : "UNKNOWN_ERROR"
    }, { status: 502 });
  }
}
