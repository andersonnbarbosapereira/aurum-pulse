import { run, portfolio, fmt, stats, H1, D1, CI, type Sig } from "./deep_base.mts";
const wick = (s: Sig) => { const b = H1.b[s.k], rg = b.h - b.l || 1; return (s.d === 1 ? b.h - Math.max(b.o, b.c) : Math.min(b.o, b.c) - b.l) / rg; };
const prevDay = (s: Sig) => { const kd = CI.cD[s.i]; return (D1.b[kd].c - D1.b[kd - 1].c) * s.d; };
const P = (name: string, f?: (s: Sig) => boolean) => console.log(fmt(name, portfolio(run({ name }, undefined, f))));
P("BASE");
console.log("— pavio contra na vela de sinal (vizinhança):");
for (const w of [0.1, 0.15, 0.2, 0.25, 0.3, 0.4]) P(`bloqueia pavio contra > ${w * 100}%`, (s) => wick(s) <= w);
console.log("— dia anterior (D1) fechou contra a direção:");
P("só se o D1 anterior fechou contra", (s) => prevDay(s) <= 0);
P("pavio ≤ 25% + D1 anterior contra", (s) => wick(s) <= 0.25 && prevDay(s) <= 0);
console.log("— por setup, com pavio ≤ 25%:");
for (const m of ["velaForca", "recuoEMA20", "canalH1_24", "canalH4_60"]) { const b = portfolio(run({ name: "b" })).filter((x) => x.m === m), f = portfolio(run({ name: "f" }, undefined, (s) => wick(s) <= 0.25)).filter((x) => x.m === m); console.log(`  ${m.padEnd(11)} base ${stats(b).avg.toFixed(2)}R (${b.length}) → filtrado ${stats(f).avg.toFixed(2)}R (${f.length})`); }
