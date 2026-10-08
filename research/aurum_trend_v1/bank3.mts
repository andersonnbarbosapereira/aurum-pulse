import fs from "node:fs";
const ALL: any[] = JSON.parse(fs.readFileSync("bank_trades.json", "utf8"));
const scaled = ALL.map((x) => ({ ...x, riskNow: (x.risk * 4100) / x.px, y: new Date(x.t * 1000).getUTCFullYear() }));
// sequência de perdas e queda em R por ano (todas as 5 em paralelo, ordem cronológica de saída)
for (let y = 2018; y <= 2026; y++) {
  const z = scaled.filter((x) => x.y === y).sort((a, b) => a.end - b.end);
  let run = 0, maxRun = 0, eq = 0, pk = 0, dd = 0; for (const x of z) { if (x.R < 0) { run++; maxRun = Math.max(maxRun, run); } else run = 0; eq += x.R; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  const med = [...z.map((x) => x.riskNow)].sort((a, b) => a - b)[z.length >> 1];
  console.log(`${y}: ${z.length} op · ${(z.reduce((s, x) => s + x.R, 0)).toFixed(0)}R no ano · pior sequência de perdas ${maxRun} · maior queda ${dd.toFixed(1)}R · risco mediano a preço de hoje US$ ${med.toFixed(0)} → queda em US$ ≈ ${(dd * med).toFixed(0)}`);
}
// quanto custa a pior queda (em R) e qual risco por operação ela permite numa banca de 500 com queda máx. de 30%/40%/50%
const z = scaled.sort((a, b) => a.end - b.end); let eq = 0, pk = 0, dd = 0; for (const x of z) { eq += x.R; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
console.log(`\nPior queda de 2018–2026 (5 setups juntos): ${dd.toFixed(1)}R`);
for (const lim of [0.3, 0.4, 0.5]) console.log(`  para no máximo ${lim * 100}% de queda numa banca de US$500 → risco por operação ≤ US$ ${((500 * lim) / dd).toFixed(1)}`);
