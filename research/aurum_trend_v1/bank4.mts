import fs from "node:fs";
const ALL: any[] = JSON.parse(fs.readFileSync("bank_trades.json", "utf8"));
const mods = [...new Set(ALL.map((x) => x.m))];
function evalSet(set: string[], maxOpen: number, capRel = 99) {
  let t = ALL.filter((x) => set.includes(x.m) && (x.risk / x.px) * 100 <= capRel).sort((a, b) => a.t - b.t);
  const keep: any[] = []; let ends: number[] = [];
  for (const x of t) { ends = ends.filter((e) => e > x.t); if (ends.length >= maxOpen) continue; keep.push(x); ends.push(x.end); }
  const z = keep.sort((a, b) => a.end - b.end); let eq = 0, pk = 0, dd = 0; for (const x of z) { eq += x.R; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  const yrs = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => z.filter((x) => new Date(x.t * 1000).getUTCFullYear() === y).reduce((s, x) => s + x.R, 0));
  const tr = z.filter((x) => new Date(x.t * 1000).getUTCFullYear() <= 2022).reduce((s, x) => s + x.R, 0) / 5;
  const medRiskNow = [...z.filter((x) => x.t >= Date.UTC(2025, 0, 1) / 1000).map((x) => x.risk)].sort((a, b) => a - b)[Math.floor(z.filter((x) => x.t >= Date.UTC(2025, 0, 1) / 1000).length / 2)];
  return { set: set.join("+"), maxOpen, capRel, n: z.length, perMonth: z.length / 105, Ryr: eq / 8.75, trYr: tr, dd, ratio: tr / dd, yrs, medRiskNow };
}
const subsets: string[][] = []; for (let mask = 1; mask < 1 << mods.length; mask++) subsets.push(mods.filter((_, i) => mask & (1 << i)));
const res: any[] = [];
for (const s of subsets) for (const mo of [1, 2, 3, 5]) for (const cr of [99, 0.7]) res.push(evalSet(s, mo, cr));
// escolha pela razão (R/ano no TREINO) / (pior queda em R de todo o período)
res.sort((a, b) => b.ratio - a.ratio);
console.log("Melhores pela razão ganho anual do treino ÷ pior queda (R):");
for (const r of res.slice(0, 15)) console.log(`${r.set.padEnd(58)} máx ${r.maxOpen} abertas · stop ≤ ${r.capRel === 99 ? "∞" : r.capRel + "%"} · ${r.perMonth.toFixed(1)} op/mês · ${r.Ryr.toFixed(0)}R/ano (treino ${r.trYr.toFixed(0)}) · pior queda ${r.dd.toFixed(0)}R · anos [${r.yrs.map((v: number) => v.toFixed(0)).join(" ")}] · risco mediano hoje US$ ${r.medRiskNow?.toFixed(0)}`);
fs.writeFileSync("bank4_res.json", JSON.stringify(res));
