// banca necessária para 0,01 lote sobreviver às piores quedas históricas (janelas a preço de hoje)
import fs from "node:fs";
const ALL: any[] = JSON.parse(fs.readFileSync("bank_trades.json", "utf8"));
const SET = ["recuoEMA20", "velaForca", "canalH4_60", "canalH1_24"];
const z = ALL.filter((x) => SET.includes(x.m) && (x.risk / x.px) * 100 <= 0.7).map((x) => ({ ...x, usd: x.R * (x.risk * 4100) / x.px })).sort((a, b) => a.t - b.t);
const keep: any[] = []; let ends: number[] = []; for (const x of z) { ends = ends.filter((e) => e > x.t); if (ends.length >= 3) continue; keep.push(x); ends.push(x.end); }
const k = keep.sort((a, b) => a.end - b.end); let eq = 0, pk = 0, dd = 0; for (const x of k) { eq += x.usd; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
console.log(`pior queda 2018–2026 com 0,01 lote (a preço de hoje): US$ ${dd.toFixed(0)} · lucro médio US$ ${(eq / 105).toFixed(0)}/mês · ${(k.length / 105).toFixed(1)} op/mês`);
for (const b of [500, 750, 1000, 1500, 2000]) console.log(`  banca US$${b}: a pior queda seria ${((100 * dd) / b).toFixed(0)}% da banca`);
