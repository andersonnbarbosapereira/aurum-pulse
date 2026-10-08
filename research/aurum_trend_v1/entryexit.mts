// Mesmo contexto aprovado (tendência H4+D1, rompimento do H1 de 24h, não perseguir), outras ENTRADAS e SAÍDAS.
import { M5, H1, H4, simulate, type Sig } from "./lib.mts";
import { F2b, F2, I, CI } from "./families.mts";
const ext = (s: Sig) => { const k4 = CI.c4[s.i]; return ((H4.b[k4].c - I.h4.e50[k4]) / I.h4.atr[k4]) * s.dir; };
const sg = (v: number) => (Number.isFinite(v) ? (v >= 0 ? "+" : "") + v.toFixed(2) : " —");
const COST = 0.5, T0 = Date.UTC(2025, 0, 1) / 1000;
type Entry = "mercado" | "reteste" | "recuo05";
type Exit = "trail6" | "ema50h1" | "h4vira" | "fundoH1" | "trail6+h4vira";
const h4Trend = (k4: number) => { const e20 = I.h4.e20[k4], e50 = I.h4.e50[k4], c = H4.b[k4].c; return e20 > e50 && c > e50 ? 1 : e20 < e50 && c < e50 ? -1 : 0; };

function run(sigs: Sig[], entry: Entry, exit: Exit, maxOpen = 1, mod: "A" | "B" = "A") {
  const out: { t: number; R: number; risk: number; d: number }[] = []; const opens: number[] = [];
  for (const s of sigs) {
    for (let q = opens.length - 1; q >= 0; q--) if (opens[q] < s.i) opens.splice(q, 1);
    if (opens.length >= maxOpen) continue;
    const k1 = CI.c1[s.i], a = mod === "A" ? I.h1.atr[k1] : I.h4.atr[CI.c4[s.i]], d = s.dir, close = M5[s.i].c;
    const level = mod === "A" ? (d === 1 ? Math.max(...H1.b.slice(k1 - 24, k1).map((x) => x.h)) : Math.min(...H1.b.slice(k1 - 24, k1).map((x) => x.l))) : close;
    // preço de entrada
    let e = NaN, j0 = s.i + 1;
    if (entry === "mercado") e = M5[s.i + 1].o;
    else {
      const lim = entry === "reteste" ? level : close - d * 0.5 * a, until = M5[s.i].t + 12 * 3600;
      for (let j = s.i + 1; j < M5.length && M5[j].t < until; j++) { const m = M5[j]; if (d === 1 ? m.l <= lim : m.h >= lim) { e = d === 1 ? Math.min(lim, m.o) : Math.max(lim, m.o); j0 = j; break; } }
      if (!Number.isFinite(e)) continue; // não executou → sem operação
    }
    const stop0 = e - d * 2.5 * a, risk = 2.5 * a; let stop = stop0, best = e, R = NaN, j = j0, lastK1 = CI.c1[j0], lastK4 = CI.c4[j0];
    const maxT = M5[s.i].t + (mod === "A" ? 10 : 20) * 86400;
    for (; j < M5.length && M5[j].t < maxT; j++) {
      const m = M5[j];
      if (j > j0 && (d === 1 ? m.l <= stop : m.h >= stop)) { R = ((stop - e) * d) / risk; break; }
      if (j === j0 && entry !== "mercado" && (d === 1 ? m.c <= stop : m.c >= stop)) { R = -1; break; }
      best = d === 1 ? Math.max(best, m.h) : Math.min(best, m.l);
      if (exit === "trail6" || exit === "trail6+h4vira") { const ts = best - d * (mod === "A" ? 6 : 4) * a; stop = d === 1 ? Math.max(stop, ts) : Math.min(stop, ts); }
      const k1n = CI.c1[j], k4n = CI.c4[j];
      if (k1n !== lastK1) { lastK1 = k1n; const h = H1.b[k1n];
        if (exit === "ema50h1" && (h.c - I.h1.e50[k1n]) * d < 0 && j + 1 < M5.length) { R = ((M5[j + 1].o - e) * d) / risk; break; }
        if (exit === "fundoH1") { const w = H1.b.slice(k1n - 9, k1n + 1), sw = d === 1 ? Math.min(...w.map((x) => x.l)) : Math.max(...w.map((x) => x.h)); const ts = sw - d * 0.2 * a; stop = d === 1 ? Math.max(stop, ts) : Math.min(stop, ts); }
      }
      if (k4n !== lastK4) { lastK4 = k4n; if ((exit === "h4vira" || exit === "trail6+h4vira") && h4Trend(k4n) !== d && j + 1 < M5.length) { R = ((M5[j + 1].o - e) * d) / risk; break; } }
    }
    if (!Number.isFinite(R)) R = ((M5[Math.min(j, M5.length - 1)].c - e) * d) / risk;
    out.push({ t: M5[s.i].t, R: R - COST / risk, risk, d }); opens.push(j);
  }
  return out;
}
function rep(name: string, t: { t: number; R: number; risk: number }[]) {
  const n = t.length, a = t.reduce((s, x) => s + x.R, 0) / n, sd = Math.sqrt(t.reduce((s, x) => s + (x.R - a) ** 2, 0) / n);
  const ys = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => { const z = t.filter((x) => new Date(x.t * 1000).getUTCFullYear() === y); return z.length ? z.reduce((s, x) => s + x.R, 0) / z.length : NaN; });
  const tr = t.filter((x) => new Date(x.t * 1000).getUTCFullYear() <= 2022), trA = tr.reduce((s, x) => s + x.R, 0) / tr.length;
  const rec = t.filter((x) => x.t >= T0); let e = 0, p = 0, dd = 0; for (const x of [...t].sort((u, v) => u.t - v.t)) { e += x.R; p = Math.max(p, e); dd = Math.max(dd, p - e); }
  console.log(`${name.padEnd(34)} ${(n / 107).toFixed(1).padStart(4)} op/mês · ${sg(a)}R t=${(a / (sd / Math.sqrt(n))).toFixed(1)} · acerto ${(100 * t.filter((x) => x.R > 0).length / n).toFixed(0)}% · DD ${dd.toFixed(0)}R · treino ${sg(trA)} · anos+ ${ys.filter((v) => v > 0).length}/9 [${ys.map(sg).join(" ")}] · 2025-26 US$ ${(rec.reduce((s, x) => s + x.R * x.risk, 0) / 21).toFixed(0)}/mês`);
}
const A = F2b({ n: 24, stopAtr: 2.5, trail: 6, flt: "both" }).filter((s) => ext(s) <= 2.5).sort((a, b) => a.i - b.i);
console.log("Módulo A (rompimento H1 alinhado) — entradas × saídas, 1 posição:");
for (const en of ["mercado", "reteste", "recuo05"] as Entry[]) for (const ex of ["trail6", "ema50h1", "h4vira", "fundoH1", "trail6+h4vira"] as Exit[]) rep(`A ${en} · ${ex}`, run(A, en, ex));
const B = F2({ n: 60, stopAtr: 2.5, trail: 4, d1: true }).sort((a, b) => a.i - b.i);
console.log("Módulo B (rompimento H4):");
for (const en of ["mercado", "recuo05"] as Entry[]) for (const ex of ["trail6", "h4vira", "trail6+h4vira"] as Exit[]) rep(`B ${en} · ${ex}`, run(B, en, ex, 1, "B"));
