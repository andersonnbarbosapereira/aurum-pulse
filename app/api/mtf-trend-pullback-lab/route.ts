import { NextResponse } from "next/server";
import { getHistoricalPrices, resolveGoldEpic } from "@/lib/capital";
import { runMtfTrendPullbackLab } from "@/lib/mtf-trend-pullback-lab";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function dedupe(xs: any[]) {
  const m = new Map<string, any>();
  for (const x of xs) {
    const k = String(x?.snapshotTimeUTC ?? x?.snapshotTime ?? "");
    if (k) m.set(k, x);
  }
  return [...m.values()];
}

async function fetchRange(epic: string, res: string, start: Date, end: Date, stepDays: number) {
  const jobs: { from: Date; to: Date }[] = [];
  for (let t = start.getTime(); t < end.getTime(); t += stepDays * 86_400_000) {
    jobs.push({
      from: new Date(t),
      to: new Date(Math.min(t + stepDays * 86_400_000 - 1, end.getTime()))
    });
  }
  const raw: any[] = [];
  for (let i = 0; i < jobs.length; i += 4) {
    const parts = await Promise.all(jobs.slice(i, i + 4).map(async (j) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await getHistoricalPrices(epic, res, j.from, j.to, 1000);
        } catch (e) {
          if (e instanceof Error && e.message === "CAPITAL_API_429" && attempt < 2) {
            await sleep(700 * (attempt + 1));
            continue;
          }
          throw e;
        }
      }
      return [];
    }));
    for (const p of parts) raw.push(...p);
    if (i + 4 < jobs.length) await sleep(300);
  }
  return dedupe(raw);
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const offset = Math.max(0, Math.min(600, Number(u.searchParams.get("offset") || 0)));
    const epic = await resolveGoldEpic();
    const end = new Date(Date.now() - offset * 86_400_000);
    const start = new Date(end.getTime() - 180 * 86_400_000);
    const dailyStart = new Date(start.getTime() - 220 * 86_400_000);

    const [m5, daily] = await Promise.all([
      fetchRange(epic, "MINUTE_5", start, end, 3),
      getHistoricalPrices(epic, "DAY", dailyStart, end, 1000)
    ]);

    return NextResponse.json(
      { mode: "mtf-trend-pullback-lab", source: "Capital.com", offsetDays: offset, ...runMtfTrendPullbackLab(m5, daily, 120) },
      { headers: { "X-Robots-Tag": "noindex", "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json(
      { status: "unavailable", diagnostic: e instanceof Error ? e.message : "UNKNOWN_ERROR" },
      { status: 502 }
    );
  }
}
