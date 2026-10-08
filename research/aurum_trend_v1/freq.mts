import { H4, M5, simulate, type Sig, type Trade } from "./lib.mts";
import { F2, F2b, F1b, F1, I, CI } from "./families.mts";
const ext = (s: Sig) => { const k4 = CI.c4[s.i]; return ((H4.b[k4].c - I.h4.e50[k4]) / I.h4.atr[k4]) * s.dir; };
const sg = (v: number) => (Number.isFinite(v) ? (v >= 0 ? "+" : "") + v.toFixed(2) : " —");
const T0 = Date.UTC(2025, 0, 1) / 1000, months = (2250 / 21); // ~107 meses no total
function rep(name: string, t: Trade[]) {
  t = [...t].sort((a, b) => a.t - b.t);
  const n = t.length, a = t.reduce((s, x) => s + x.R, 0) / n, sd = Math.sqrt(t.reduce((s, x) => s + (x.R - a) ** 2, 0) / n);
  const yr = (y: number) => { const z = t.filter((x) => new Date(x.t * 1000).getUTCFullYear() === y); return z.length ? z.reduce((s, x) => s + x.R, 0) / z.length : NaN; };
  const ys = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map(yr);
  const rec = t.filter((x) => x.t >= T0), usdRec = rec.reduce((s, x) => s + x.R * x.risk, 0) / 21; // US$/mês com 0,01 lote em 2025–26 (21 meses)
  const riskRec = rec.reduce((s, x) => s + x.risk, 0) / rec.length;
  let eq = 0, pk = 0, dd = 0; for (const x of t) { eq += x.R; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  const tr = t.filter((x) => new Date(x.t * 1000).getUTCFullYear() <= 2022), trA = tr.reduce((s, x) => s + x.R, 0) / tr.length;
  console.log(`${name.padEnd(40)} ${(n / months).toFixed(1).padStart(4)} op/mês · ${sg(a)}R t=${(a / (sd / Math.sqrt(n))).toFixed(1)} · R/mês ${(n * a / months).toFixed(1)} · DD ${dd.toFixed(0)}R · treino ${sg(trA)} · anos+ ${ys.filter((v) => v > 0).length}/9 [${ys.map(sg).join(" ")}] · 2025-26: US$ ${usdRec.toFixed(0)}/mês, risco médio US$ ${riskRec.toFixed(0)}`);
}
const A = F2b({ n: 24, stopAtr: 2.5, trail: 6, flt: "both" }).filter((s) => ext(s) <= 2.5);
const B = F2({ n: 60, stopAtr: 2.5, trail: 4, d1: true });
console.log("— referência (lote 0,01, sem parcial):");
const tA = simulate(A), tB = simulate(B); rep("A", tA); rep("B", tB); rep("A+B (atual)", [...tA, ...tB]);
console.log("— reentradas: até N posições simultâneas por módulo:");
for (const m of [2, 3, 5]) { rep(`A até ${m} abertas`, simulate(A, 0.5, m)); rep(`B até ${m} abertas`, simulate(B, 0.5, m)); }
console.log("— módulos extras candidatos:");
const A12 = F2b({ n: 12, stopAtr: 2.5, trail: 6, flt: "both" }).filter((s) => ext(s) <= 2.5); rep("A' canal 12h", simulate(A12));
const Ad1 = F2b({ n: 24, stopAtr: 2.5, trail: 6, flt: "d1" }).filter((s) => ext(s) <= 2.5); rep("A'' só filtro D1", simulate(Ad1));
const B30 = F2({ n: 30, stopAtr: 2.5, trail: 4, d1: true }); rep("B' canal 30 H4", simulate(B30));
const C = F1b({ rsiTh: 45, look: 4, trail: 4, d1: true }); rep("C recuo M15", simulate(C)); rep("C até 3 abertas", simulate(C, 0.5, 3));
const P1 = F1({ rsiTh: 50, look: 8, tp: null, trail: 4, d1: true }); rep("D recuo H1 (F1)", simulate(P1));
