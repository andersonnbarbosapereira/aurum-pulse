// Base da análise profunda: sinais da carteira V2 (4 setups, stop ≤ 0,7% do preço) e um simulador com política de gestão plugável.
process.env.NO_SEARCH = "1";
const { trig, ctx, ses } = await import("./combo.mts");
import { M5, H1, H4, D1 } from "./lib.mts";
import { I, CI } from "./families.mts";
export { M5, H1, H4, D1, I, CI };

export const SETUPS = [["velaForca", "D1", "Londres+NY", 1.5], ["recuoEMA20", "H4+D1", "Londres+NY", 1.5], ["canalH1_24", "H4+D1+naoEsticado", "todas", 2.5], ["canalH4_60", "D1", "todas", 2.5]] as const;
export type Sig = { m: string; k: number; i: number; d: 1 | -1; a: number; sm: number };
export const SIGS: Sig[] = [];
for (const [tn, cn, sn, sm] of SETUPS)
  for (const [k, d] of trig[tn] as [number, 1 | -1][]) {
    if (!ctx[cn](k, d) || !ses[sn](k)) continue;
    const i = H1.idx5[k] + 1, a = I.h1.atr[k];
    if (i + 2 >= M5.length || !(a > 0)) continue;
    if (((sm * a) / M5[i].c) * 100 > 0.7) continue; // teto de risco
    SIGS.push({ m: tn, k, i, d, a, sm });
  }
SIGS.sort((x, y) => x.i - y.i);

export type Ctx = { s: Sig; e: number; risk: number; j: number; i0: number; best: number; worst: number; stop: number; mfeR: number; maeR: number; rNow: number; bars: number; st: any };
export type Policy = { name: string; onBar?: (c: Ctx) => { stop?: number; exit?: boolean } | void; trail?: number };
export type Trade = { m: string; t: number; d: number; e: number; risk: number; a: number; R: number; mfe: number; mae: number; bars: number; barsToMfe: number; i0: number; iEnd: number; why: string; k: number };
const COST = 0.5, MAXB = 12 * 240;
/** stop primeiro no candle; depois atualiza melhor preço, trailing e a política (vale a partir do próximo candle); saída "exit" no fechamento do candle */
export function run(pol: Policy, sigs: Sig[] = SIGS, filter?: (s: Sig) => boolean): Trade[] {
  const out: Trade[] = []; const busy: Record<string, number> = {};
  for (const s of sigs) {
    if (filter && !filter(s)) continue;
    if (s.i <= (busy[s.m] ?? -1)) continue;
    const i0 = s.i + 1, e = M5[i0].o, risk = s.sm * s.a, d = s.d; let stop = e - d * risk;
    const c: Ctx = { s, e, risk, j: i0, i0, best: e, worst: e, stop, mfeR: 0, maeR: 0, rNow: 0, bars: 0, st: {} };
    let R = NaN, why = "tempo", j = i0, tMfe = 0;
    for (; j < M5.length && j < i0 + MAXB; j++) {
      const b = M5[j];
      if (j > i0 && b.t - M5[j - 1].t > 4 * 86400) { R = ((M5[j - 1].c - e) * d) / risk; why = "gap"; break; }
      if (d === 1 ? b.l <= c.stop : b.h >= c.stop) { R = ((c.stop - e) * d) / risk; why = c.stop === e - d * risk ? "stop" : "stopMovel"; break; }
      if (d === 1 ? b.h > c.best : b.l < c.best) { c.best = d === 1 ? b.h : b.l; tMfe = j - i0; }
      c.worst = d === 1 ? Math.min(c.worst, b.l) : Math.max(c.worst, b.h);
      c.mfeR = ((c.best - e) * d) / risk; c.maeR = ((e - c.worst) * d) / risk; c.rNow = ((b.c - e) * d) / risk; c.j = j; c.bars = j - i0 + 1;
      const tr = pol.trail ?? 6; const ts = c.best - d * tr * s.a; c.stop = d === 1 ? Math.max(c.stop, ts) : Math.min(c.stop, ts);
      const r = pol.onBar?.(c);
      if (r?.exit) { R = c.rNow; why = "regra"; j++; break; }
      if (r?.stop !== undefined) c.stop = d === 1 ? Math.max(c.stop, r.stop) : Math.min(c.stop, r.stop);
    }
    if (!Number.isFinite(R)) { const jj = Math.min(j, M5.length) - 1; R = ((M5[jj].c - e) * d) / risk; }
    out.push({ m: s.m, t: M5[s.i].t, d, e, risk, a: s.a, R: R - COST / risk, mfe: c.mfeR, mae: c.maeR, bars: j - i0, barsToMfe: tMfe, i0, iEnd: Math.min(j, M5.length - 1), why, k: s.k });
    busy[s.m] = j;
  }
  return out;
}
/** carteira: no máx. 3 abertas (por ordem de chegada) */
export function portfolio(tr: Trade[], maxOpen = 3) {
  const keep: Trade[] = []; let ends: number[] = [];
  for (const x of [...tr].sort((a, b) => a.i0 - b.i0)) { ends = ends.filter((e) => e > x.i0); if (ends.length >= maxOpen) continue; keep.push(x); ends.push(x.iEnd); }
  return keep;
}
const yr = (t: number) => new Date(t * 1000).getUTCFullYear();
export function stats(tr: Trade[]) {
  const z = [...tr].sort((a, b) => a.iEnd - b.iEnd); let eq = 0, pk = 0, dd = 0; for (const x of z) { eq += x.R; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  const sumY = (lo: number, hi: number) => z.filter((x) => yr(x.t) >= lo && yr(x.t) <= hi).reduce((s, x) => s + x.R, 0);
  const years = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => sumY(y, y));
  return { n: z.length, total: eq, avg: eq / z.length, dd, tr: sumY(2018, 2022) / 5, va: sumY(2023, 2024) / 2, te: sumY(2025, 2026) / 1.75, years, win: z.filter((x) => x.R > 0).length / z.length };
}
export const fmt = (name: string, tr: Trade[]) => { const s = stats(tr); const sg = (v: number) => (v >= 0 ? "+" : "") + v.toFixed(0); return `${name.padEnd(52)} ${String(s.n).padStart(4)} op · ${s.avg >= 0 ? "+" : ""}${s.avg.toFixed(2)}R · acerto ${(s.win * 100).toFixed(0)}% · R/ano tr ${sg(s.tr)} va ${sg(s.va)} te ${sg(s.te)} · queda ${s.dd.toFixed(0)}R · razão tr/queda ${(s.tr / s.dd).toFixed(2)} · anos [${s.years.map(sg).join(" ")}]`; };
