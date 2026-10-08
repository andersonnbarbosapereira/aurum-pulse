// 1) Vencedoras: potencial (MFE) × capturado; perdedoras: quanto chegaram a ganhar antes
import { run, portfolio, fmt, stats, SIGS } from "./deep_base.mts";
const base = portfolio(run({ name: "base" }));
console.log(fmt("BASE (4 setups, stop≤0,7%, máx 3, trail 6 ATR)", base));
const W = base.filter((x) => x.R > 0), L = base.filter((x) => x.R <= 0);
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
console.log(`\nVENCEDORAS (${W.length}): resultado mediano ${q(W.map((x) => x.R), 0.5).toFixed(2)}R · pico (MFE) mediano ${q(W.map((x) => x.mfe), 0.5).toFixed(2)}R · devolvido mediano ${q(W.map((x) => x.mfe - x.R), 0.5).toFixed(2)}R (${(100 * q(W.map((x) => (x.mfe - x.R) / x.mfe), 0.5)).toFixed(0)}% do pico) · tempo até o pico ${(q(W.map((x) => x.barsToMfe), 0.5) / 12).toFixed(0)}h · duração ${(q(W.map((x) => x.bars), 0.5) / 12).toFixed(0)}h`);
console.log(`  soma do pico ${W.reduce((s, x) => s + x.mfe, 0).toFixed(0)}R · soma capturada ${W.reduce((s, x) => s + x.R, 0).toFixed(0)}R → devolvido ${W.reduce((s, x) => s + x.mfe - x.R, 0).toFixed(0)}R`);
console.log(`\nPERDEDORAS (${L.length}): ${(100 * L.filter((x) => x.mfe >= 0.5).length / L.length).toFixed(0)}% chegaram a +0,5R · ${(100 * L.filter((x) => x.mfe >= 1).length / L.length).toFixed(0)}% a +1R · ${(100 * L.filter((x) => x.mfe >= 2).length / L.length).toFixed(0)}% a +2R antes de perder · pico mediano ${q(L.map((x) => x.mfe), 0.5).toFixed(2)}R · duração mediana ${(q(L.map((x) => x.bars), 0.5) / 12).toFixed(1)}h`);
console.log(`  stop cheio (≤ −0,95R): ${L.filter((x) => x.R <= -0.95).length} · saída no stop móvel com perda: ${L.filter((x) => x.why === "stopMovel").length}`);
console.log("\nDistribuição do pico (MFE) de TODAS as operações:");
for (const [a, b] of [[0, 0.5], [0.5, 1], [1, 2], [2, 3], [3, 5], [5, 10], [10, 99]]) { const z = base.filter((x) => x.mfe >= a && x.mfe < b); console.log(`  pico ${a}–${b}R: ${String(z.length).padStart(4)} op (${(100 * z.length / base.length).toFixed(0)}%) · resultado médio ${(z.reduce((s, x) => s + x.R, 0) / z.length).toFixed(2)}R · devolveram em média ${(z.reduce((s, x) => s + x.mfe - x.R, 0) / z.length).toFixed(2)}R`); }
console.log("\nPor setup:"); for (const m of ["velaForca", "recuoEMA20", "canalH1_24", "canalH4_60"]) console.log(fmt("  " + m, base.filter((x) => x.m === m)));
console.log("sinais brutos", SIGS.length);
