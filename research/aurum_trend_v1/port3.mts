import { H4, simulate, type Sig, type Trade } from "./lib.mts";
import { F2, F2b, F1b, I, CI } from "./families.mts";
const ext = (s: Sig) => { const k4 = CI.c4[s.i]; return ((H4.b[k4].c - I.h4.e50[k4]) / I.h4.atr[k4]) * s.dir; };
const sg = (v: number) => (Number.isFinite(v) ? (v >= 0 ? "+" : "") + v.toFixed(2) : " —");
const A = F2b({ n: 24, stopAtr: 2.5, trail: 6, flt: "both" }).filter((s) => ext(s) <= 2.5);
const A12 = F2b({ n: 12, stopAtr: 2.5, trail: 6, flt: "both" }).filter((s) => ext(s) <= 2.5);
const A72 = F2b({ n: 72, stopAtr: 2.5, trail: 6, flt: "both" }).filter((s) => ext(s) <= 2.5);
const B = F2({ n: 60, stopAtr: 2.5, trail: 4, d1: true }), B30 = F2({ n: 30, stopAtr: 2.5, trail: 4, d1: true });
const C = F1b({ rsiTh: 45, look: 4, trail: 4, d1: true });
const T0 = Date.UTC(2025, 0, 1) / 1000;
function rep(name: string, parts: Trade[][]) {
  const t = parts.flat().sort((a, b) => a.t - b.t), n = t.length, a = t.reduce((s, x) => s + x.R, 0) / n;
  const ys = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => { const z = t.filter((x) => new Date(x.t * 1000).getUTCFullYear() === y); return z.reduce((s, x) => s + x.R, 0); });
  const rec = t.filter((x) => x.t >= T0); let e = 0, p = 0, dd = 0; for (const x of rec) { e += x.R * x.risk; p = Math.max(p, e); dd = Math.max(dd, p - e); }
  let eR = 0, pR = 0, ddR = 0; for (const x of t) { eR += x.R; pR = Math.max(pR, eR); ddR = Math.max(ddR, pR - eR); }
  const mo = new Map<string, number>(); for (const x of rec) { const k = new Date(x.t * 1000).toISOString().slice(0, 7); mo.set(k, (mo.get(k) ?? 0) + x.R * x.risk); }
  console.log(`${name.padEnd(34)} ${(n / 107).toFixed(1).padStart(4)} op/mês · ${sg(a)}R/op · R por ano [${ys.map((v) => v.toFixed(0)).join(" ")}] · DD ${ddR.toFixed(0)}R · 2025-26: ${(rec.length / 21).toFixed(1)} op/mês, US$ ${(rec.reduce((s, x) => s + x.R * x.risk, 0) / 21).toFixed(0)}/mês, pior queda US$ ${dd.toFixed(0)}, meses+ ${[...mo.values()].filter((v) => v > 0).length}/${mo.size}`);
}
const s1 = (x: Sig[], m = 1) => simulate(x, 0.5, m);
rep("P1 A+B (atual)", [s1(A), s1(B)]);
rep("P2 A(2)+B(2)", [s1(A, 2), s1(B, 2)]);
rep("P3 A+B+C", [s1(A), s1(B), s1(C)]);
rep("P4 A(2)+B(2)+C", [s1(A, 2), s1(B, 2), s1(C)]);
rep("P5 multi-escala A12+A24+A72+B30+B60", [s1(A12), s1(A), s1(A72), s1(B30), s1(B)]);
rep("P6 P5 + C", [s1(A12), s1(A), s1(A72), s1(B30), s1(B), s1(C)]);
