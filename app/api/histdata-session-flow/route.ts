
import { NextResponse } from "next/server";
import { fetchHistDataYear, histDataM1ToM15, toCapitalLikeRaw } from "@/lib/histdata";
import { runSessionFlowLab } from "@/lib/session-flow-lab";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const endText = u.searchParams.get("end") || "2023-12-31";
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(endText)) {
      return NextResponse.json({ status: "bad_request", diagnostic: "END_FORMAT_YYYY_MM_DD" }, { status: 400 });
    }

    const end = new Date(endText + "T23:59:59.999Z");
    if (!Number.isFinite(end.getTime()) || end.getTime() >= Date.UTC(2024, 6, 1)) {
      return NextResponse.json({ status: "bad_request", diagnostic: "USE_HISTDATA_FOR_PRE_2024_VALIDATION" }, { status: 400 });
    }

    const start = new Date(end.getTime() - 270 * 86_400_000);
    const years: number[] = [];
    for (let y = start.getUTCFullYear(); y <= end.getUTCFullYear(); y++) years.push(y);

    const rows = [];
    for (const year of years) {
      const csv = await fetchHistDataYear("XAUUSD", year);
      rows.push(...histDataM1ToM15(csv));
    }

    const filtered = rows
      .filter((x) => x.time >= start.getTime() && x.time <= end.getTime())
      .sort((a, b) => a.time - b.time);

    const dedup = new Map<number, (typeof filtered)[number]>();
    for (const x of filtered) dedup.set(x.time, x);
    const m15 = [...dedup.values()].sort((a, b) => a.time - b.time);

    return NextResponse.json({
      mode: "histdata-session-flow-validation",
      source: "HistData XAUUSD Generic ASCII M1 -> M15",
      requestedEnd: endText,
      years,
      timezoneNormalization: "HistData fixed EST -> UTC (+5h)",
      ...runSessionFlowLab(toCapitalLikeRaw(m15), 180)
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
