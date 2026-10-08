import { run, portfolio, stats, fmt, M5, type Policy, type Trade } from "./deep_base.mts";
const T0 = Date.UTC(2025, 0, 1) / 1000;
const usd = (t: Trade[]) => { const r = t.filter((x) => x.t >= T0); return r.reduce((s, x) => s + x.R * x.risk * (4100 / x.e), 0) / 21; }; // US$/mês 2025–26 com 0,01 lote, a preço de hoje
const usdDD = (t: Trade[]) => { const z = [...t].sort((a, b) => a.iEnd - b.iEnd); let eq = 0, pk = 0, dd = 0; for (const x of z) { eq += x.R * x.risk * (4100 / x.e); pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); } return dd; };
const rows: { n: string; t: Trade[] }[] = [];
const add = (n: string, p: Policy) => rows.push({ n, t: portfolio(run(p)) });
add("BASE (stop do setup, stop móvel 6 ATR)", { name: "b" });
for (const tp of [1.5, 2, 2.5]) for (const sa of [1, 1.5, 2, 2.5]) for (const mh of [24, 48, 120]) for (const be of [false, true])
  add(`alvo ${tp}R · stop ${sa} ATR · até ${mh}h${be ? " · empate em +1R" : ""}`, { name: "", tpR: tp, stopAtr: sa, maxH: mh, noTrail: true, onBar: be ? (c) => (c.mfeR >= 1 ? { stop: c.e + c.s.d * 0.1 * c.risk } : undefined) : undefined });
rows.sort((a, b) => stats(b.t).tr - stats(a.t).tr);
console.log("Ordenado pelo TREINO (R/ano 2018–22). US$ = 0,01 lote a preço de hoje:");
for (const r of rows.slice(0, 25)) console.log(fmt(r.n, r.t), `· US$/mês 25–26 ${usd(r.t).toFixed(0)} · queda US$ ${usdDD(r.t).toFixed(0)}`);
const b = rows.find((r) => r.n.startsWith("BASE"))!; console.log("\n" + fmt(b.n, b.t), `· US$/mês 25–26 ${usd(b.t).toFixed(0)} · queda US$ ${usdDD(b.t).toFixed(0)}`);
console.log("\nMelhor de cada alvo:"); for (const tp of ["1.5R", "2R", "2.5R"]) { const r = rows.find((x) => x.n.startsWith(`alvo ${tp}`))!; console.log(fmt(r.n, r.t), `· US$/mês ${usd(r.t).toFixed(0)} · queda US$ ${usdDD(r.t).toFixed(0)}`); }
