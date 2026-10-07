
import { NextResponse } from "next/server";
import { getHistoricalPrices, resolveGoldEpic } from "@/lib/capital";
import { runSessionFlowLab } from "@/lib/session-flow-lab";

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

async function fetchM15(epic: string, start: Date, end: Date) {
  const jobs: { from: Date; to: Date }[] = [];
  for (let t = start.getTime(); t < end.getTime(); t += 7 * 86_400_000) {
    jobs.push({
      from: new Date(t),
      to: new Date(Math.min(t + 7 * 86_400_000 - 1, end.getTime()))
    });
  }

  const raw: any[] = [];
  for (let i = 0; i < jobs.length; i += 4) {
    const parts = await Promise.all(jobs.slice(i, i + 4).map(async (j) => {
      for (let a = 0; a < 3; a++) {
        try {
          return await getHistoricalPrices(epic, "MINUTE_15", j.from, j.to, 1000);
        } catch (e) {
          if (e instanceof Error && e.message === "CAPITAL_API_429" && a < 2) {
            await sleep(700 * (a + 1));
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
    const offset = Math.max(0, Math.min(540, Number(u.searchParams.get("offset") || 0)));
    const epic = await resolveGoldEpic();
    const end = new Date(Date.now() - offset * 86_400_000);
    const start = new Date(end.getTime() - 180 * 86_400_000);
    const m15 = await fetchM15(epic, start, end);

    return NextResponse.json(
      { mode: "session-flow-lab", source: "Capital.com", epic, offsetDays: offset, ...runSessionFlowLab(m15) },
      { headers: { "X-Robots-Tag": "noindex", "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json(
      { status: "unavailable", diagnostic: e instanceof Error ? e.message : "UNKNOWN_ERROR" },
      { status: 502 }
    );
  }
}
