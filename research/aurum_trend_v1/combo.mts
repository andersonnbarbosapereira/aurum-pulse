// Busca combinatória: gatilho × contexto × sessão × stop × saída. Simulação no caminho H1 (stop primeiro), custo 0,5 pt.
// Escolha só com 2018–2022; 2023–24 confirma; 2025–26 é o teste nunca usado na escolha.
import fs from "node:fs";
import { H1, H4, D1, nyHour, rsi } from "./lib.mts";
import { I, CI } from "./families.mts";
const b = H1.b, N = b.length, COST = 0.5;
const at5 = (k: number) => H1.idx5[k] + 1; // M5 em que o H1 k já está fechado
const k4 = new Int32Array(N), kd = new Int32Array(N);
for (let k = 0; k < N; k++) { const i = Math.min(at5(k), CI.c4.length - 1); k4[k] = CI.c4[i]; kd[k] = CI.cD[i]; }
const A = I.h1.atr, e20 = I.h1.e20, rsi2 = rsi(b.map((x) => x.c), 2);
const tr4 = (k: number) => { const j = k4[k]; if (j < 60) return 0; return I.h4.e20[j] > I.h4.e50[j] && H4.b[j].c > I.h4.e50[j] ? 1 : I.h4.e20[j] < I.h4.e50[j] && H4.b[j].c < I.h4.e50[j] ? -1 : 0; };
const trD = (k: number) => { const j = kd[k]; if (j < 60) return 0; return D1.b[j].c > I.d1.e50[j] && I.d1.e20[j] > I.d1.e50[j] ? 1 : D1.b[j].c < I.d1.e50[j] && I.d1.e20[j] < I.d1.e50[j] ? -1 : 0; };
const ext4 = (k: number, d: number) => { const j = k4[k]; return ((H4.b[j].c - I.h4.e50[j]) / I.h4.atr[j]) * d; };
const hiN = (k: number, n: number) => { let m = -Infinity; for (let q = k - n; q < k; q++) m = Math.max(m, b[q].h); return m; };
const loN = (k: number, n: number) => { let m = Infinity; for (let q = k - n; q < k; q++) m = Math.min(m, b[q].l); return m; };
const medBody = (k: number) => { const v: number[] = []; for (let q = k - 20; q < k; q++) v.push(Math.abs(b[q].c - b[q].o)); v.sort((x, y) => x - y); return v[10]; };

// ---- gatilhos: lista de [k, dir] avaliada no fechamento do H1 k ----
type T = [number, 1 | -1][];
const trig: Record<string, T> = {};
const push = (name: string, k: number, d: number) => (trig[name] ??= []).push([k, d as 1 | -1]);
for (let k = 230; k < N - 1; k++) {
  const x = b[k], a = A[k]; if (!(a > 0)) continue;
  for (const n of [12, 24, 48, 72]) { if (x.c > hiN(k, n)) push(`canalH1_${n}`, k, 1); else if (x.c < loN(k, n)) push(`canalH1_${n}`, k, -1); }
  // recuo até a EMA20 H1 e retomada (rompe máxima/mínima das 3 anteriores)
  for (const d of [1, -1] as const) {
    let touched = false; for (let q = k - 6; q < k; q++) if (d === 1 ? b[q].l <= e20[q] : b[q].h >= e20[q]) touched = true;
    if (touched && (d === 1 ? x.c > Math.max(b[k - 1].h, b[k - 2].h, b[k - 3].h) && x.c > e20[k] : x.c < Math.min(b[k - 1].l, b[k - 2].l, b[k - 3].l) && x.c < e20[k])) push("recuoEMA20", k, d);
  }
  // vela de força
  const body = x.c - x.o, rg = x.h - x.l || 1;
  if (Math.abs(body) > 1.8 * medBody(k) && (body > 0 ? (x.c - x.l) / rg > 0.75 : (x.h - x.c) / rg > 0.75)) push("velaForca", k, body > 0 ? 1 : -1);
  // engolfo tocando a EMA20
  const p = b[k - 1];
  if (x.l <= e20[k] && x.h >= e20[k]) { if (x.c > x.o && p.c < p.o && x.c >= p.o && x.o <= p.c) push("engolfoEMA", k, 1); if (x.c < x.o && p.c > p.o && x.c <= p.o && x.o >= p.c) push("engolfoEMA", k, -1); }
  // máxima/mínima do dia anterior: rompimento e captura (sweep + volta)
  const y = D1.b[kd[k]]; if (kd[k] > 0) {
    if (x.c > y.h && p.c <= y.h) push("rompeDiaAnt", k, 1); if (x.c < y.l && p.c >= y.l) push("rompeDiaAnt", k, -1);
    if (x.h > y.h && x.c < y.h) push("sweepDiaAnt", k, -1); if (x.l < y.l && x.c > y.l) push("sweepDiaAnt", k, 1);
  }
  // inside bar: vela k-1 dentro da k-2; k rompe a mãe
  const m = b[k - 2]; if (p.h <= m.h && p.l >= m.l) { if (x.c > m.h) push("insideBar", k, 1); else if (x.c < m.l) push("insideBar", k, -1); }
  // IFR(2) extremo (recuo curto)
  if (rsi2[k] < 10) push("ifr2", k, 1); else if (rsi2[k] > 90) push("ifr2", k, -1);
}
// canal H4 (avaliado quando um H4 fecha)
for (let k = 230; k < N - 1; k++) {
  const j = k4[k]; if (j < 70 || j === k4[k - 1]) continue;
  const w = H4.b; for (const n of [20, 30, 60]) { let hi = -Infinity, lo = Infinity; for (let q = j - n; q < j; q++) { hi = Math.max(hi, w[q].h); lo = Math.min(lo, w[q].l); } if (w[j].c > hi) push(`canalH4_${n}`, k, 1); else if (w[j].c < lo) push(`canalH4_${n}`, k, -1); }
}
// ---- contextos e sessões ----
const ctx: Record<string, (k: number, d: number) => boolean> = {
  livre: () => true, H4: (k, d) => tr4(k) === d, D1: (k, d) => trD(k) === d, "H4+D1": (k, d) => tr4(k) === d && trD(k) === d,
  "H4+D1+naoEsticado": (k, d) => tr4(k) === d && trD(k) === d && ext4(k, d) <= 2.5, "contraH4": (k, d) => tr4(k) === -d,
};
const ses: Record<string, (k: number) => boolean> = {
  todas: () => true, "Londres+NY": (k) => { const h = nyHour(b[k].t + 3600); return h >= 2 && h < 16; }, NY: (k) => { const h = nyHour(b[k].t + 3600); return h >= 8 && h < 16; }, semAsia: (k) => { const h = nyHour(b[k].t + 3600); return !(h >= 17 || h < 2); },
};
type Ex = { name: string; trail?: number; tp?: number; maxH: number };
const exits: Ex[] = [{ name: "trail3", trail: 3, maxH: 240 }, { name: "trail4", trail: 4, maxH: 240 }, { name: "trail6", trail: 6, maxH: 240 }, { name: "alvo1.5R", tp: 1.5, maxH: 48 }, { name: "alvo2R", tp: 2, maxH: 48 }, { name: "alvo3R", tp: 3, maxH: 72 }, { name: "tempo24h", maxH: 24 }];
const stops = [1.5, 2.5];

function sim(sigs: T, stopM: number, ex: Ex) {
  const out: { t: number; R: number; risk: number; end: number }[] = []; let busy = -1;
  for (const [k, d] of sigs) {
    if (k <= busy || k + 1 >= N) continue;
    const e = b[k + 1].o, a = A[k], risk = stopM * a; let stop = e - d * risk, best = e, R = NaN, q = k + 1;
    const tp = ex.tp ? e + d * ex.tp * risk : null;
    for (; q < N && q <= k + ex.maxH; q++) {
      const x = b[q];
      if (d === 1 ? x.l <= stop : x.h >= stop) { R = ((stop - e) * d) / risk; break; }
      if (tp !== null && (d === 1 ? x.h >= tp : x.l <= tp)) { R = ex.tp!; break; }
      best = d === 1 ? Math.max(best, x.h) : Math.min(best, x.l);
      if (ex.trail) { const ts = best - d * ex.trail * a; stop = d === 1 ? Math.max(stop, ts) : Math.min(stop, ts); }
    }
    if (!Number.isFinite(R)) { q = Math.min(q, N - 1); R = ((b[q].c - e) * d) / risk; }
    out.push({ t: b[k].t, R: R - COST / risk, risk, end: b[Math.min(q, N - 1)].t }); busy = q;
  }
  return out;
}
export { trig, ctx, ses, exits, sim };
const yr = (t: number) => new Date(t * 1000).getUTCFullYear();
const res: any[] = [];
if (!process.env.NO_SEARCH) {
for (const tn of Object.keys(trig)) for (const [cn, cf] of Object.entries(ctx)) for (const [sn, sf] of Object.entries(ses)) {
  const sigs = trig[tn].filter(([k, d]) => cf(k, d) && sf(k));
  if (sigs.length < 60) continue;
  for (const sm of stops) for (const ex of exits) {
    const t = sim(sigs, sm, ex); if (t.length < 60) continue;
    const g = (lo: number, hi: number) => { const z = t.filter((x) => yr(x.t) >= lo && yr(x.t) <= hi); return { n: z.length, a: z.length ? z.reduce((s, x) => s + x.R, 0) / z.length : NaN }; };
    const years = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => g(y, y).a);
    const rec = t.filter((x) => x.t >= Date.UTC(2025, 0, 1) / 1000);
    res.push({ name: `${tn} | ${cn} | ${sn} | stop${sm} | ${ex.name}`, n: t.length, perMonth: t.length / 105, tr: g(2018, 2022), va: g(2023, 2024), te: g(2025, 2026), years, usdRec: rec.reduce((s, x) => s + x.R * x.risk, 0) / 21, avg: t.reduce((s, x) => s + x.R, 0) / t.length });
  }
}
fs.writeFileSync("combo_out.json", JSON.stringify(res));
console.log("combinações avaliadas:", res.length);
}
