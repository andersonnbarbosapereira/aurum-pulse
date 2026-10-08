import { M5, H1, H4, D1, M15, simulate, nyHour, sg } from "./lib.mts";
import { F2b, F1b, I, CI } from "./families.mts";
const which = process.argv[2] ?? "F2b";
const sigs = which === "F2b" ? F2b({ n: 24, stopAtr: 2.5, trail: 6, flt: "both" }).map((s) => ({ ...s, part: { frac: 0.33, R: 2 } })) : F1b({ rsiTh: 45, look: 4, trail: 4, d1: true });
const tr = simulate(sigs as any);
const at = new Map(sigs.map((s) => [s.i, s]));
const rows = tr.map((t) => {
  const i = M5.findIndex((x) => x.t === t.t); const k1 = CI.c1[i], k4 = CI.c4[i], kd = CI.cD[i], d = t.dir, a1 = I.h1.atr[k1], p = H1.b[k1].c;
  const wk = H1.b.slice(k1 - 120, k1 + 1);
  const f: any = {
    nyH: nyHour(M5[i].t), dow: new Date(M5[i].t * 1000).getUTCDay(),
    adxH4: I.h4.adx[k4], adxH1: I.h1.adx[k1], rsiH1: (I.h1.rsi[k1] - 50) * d, rsiH4: (I.h4.rsi[k4] - 50) * d, rsiD1: (I.d1.rsi[kd] - 50) * d,
    extH1: ((p - I.h1.e20[k1]) / a1) * d, extH4: ((p - I.h4.e50[k4]) / I.h4.atr[k4]) * d, extD1: ((p - I.d1.e20[kd]) / I.d1.atr[kd]) * d,
    volReg: a1 / (wk.reduce((s, x) => s + (x.h - x.l), 0) / wk.length), atrD1pct: I.d1.atr[kd] / p * 100,
    bodyH1: Math.abs(H1.b[k1].c - H1.b[k1].o) / (H1.b[k1].h - H1.b[k1].l || 1), brkSize: ((H1.b[k1].c - (d === 1 ? Math.max(...H1.b.slice(k1 - 24, k1).map((x) => x.h)) : Math.min(...H1.b.slice(k1 - 24, k1).map((x) => x.l)))) / a1) * d,
    rangeH1_24: (Math.max(...H1.b.slice(k1 - 24, k1).map((x) => x.h)) - Math.min(...H1.b.slice(k1 - 24, k1).map((x) => x.l))) / a1,
    d1Slope: ((I.d1.e20[kd] - I.d1.e20[kd - 5]) / I.d1.atr[kd]) * d, side: d,
    posD1: d === 1 ? (p - D1.b[kd].l) / (D1.b[kd].h - D1.b[kd].l || 1) : (D1.b[kd].h - p) / (D1.b[kd].h - D1.b[kd].l || 1),
  };
  return { t: t.t, R: t.R, f };
});
const cut = Date.UTC(2023, 0, 1) / 1000, train = rows.filter((x) => x.t < cut);
const av = (z: any[]) => (z.length ? z.reduce((s, x) => s + x.R, 0) / z.length : NaN);
const yrs = (z: any[]) => [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => z.filter((x) => new Date(x.t * 1000).getUTCFullYear() === y)).map((q) => (q.length ? sg(av(q)) : " — ")).join(" ");
console.log(`${which}: ${rows.length} op · treino(2018–22) ${sg(av(train))} (${train.length}) · val(23–24) ${sg(av(rows.filter((x) => x.t >= cut && x.t < Date.UTC(2025, 0, 1) / 1000)))} · teste(25–26) ${sg(av(rows.filter((x) => x.t >= Date.UTC(2025, 0, 1) / 1000)))}`);
for (const k of Object.keys(rows[0].f)) {
  const s = train.map((x) => x.f[k]).sort((a, b) => a - b), q1 = s[Math.floor(s.length / 3)], q2 = s[Math.floor((2 * s.length) / 3)];
  const g = [["baixo", (x: any) => x.f[k] <= q1], ["médio", (x: any) => x.f[k] > q1 && x.f[k] <= q2], ["alto", (x: any) => x.f[k] > q2]] as const;
  console.log(`${k.padEnd(10)} cortes ${q1.toFixed(2)} / ${q2.toFixed(2)}`);
  for (const [n, f] of g) { const a = rows.filter(f as any); console.log(`   ${n.padEnd(6)} treino ${sg(av(train.filter(f as any)))} · val+teste ${sg(av(a.filter((x) => x.t >= cut)))} (${a.filter((x) => x.t >= cut).length}) · anos ${yrs(a)}`); }
}
