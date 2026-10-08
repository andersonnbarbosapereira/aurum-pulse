// 5) Grandes quedas: quando aconteceram, o que o mercado fazia, e freios testados
import { run, portfolio, fmt, stats, M5, D1, H4, I, CI, type Trade } from "./deep_base.mts";
const base = portfolio(run({ name: "base" })).sort((a, b) => a.iEnd - b.iEnd);
// episódios de queda ≥ 15R
const eps: any[] = []; let eq = 0, pk = 0, pkAt = base[0].i0, cur: any = null;
for (const x of base) { eq += x.R; if (eq > pk) { if (cur && cur.dd >= 15) eps.push(cur); cur = null; pk = eq; pkAt = x.iEnd; } else { const dd = pk - eq; if (!cur) cur = { from: pkAt, dd: 0, trades: [] as Trade[] }; cur.trades.push(x); if (dd > cur.dd) { cur.dd = dd; cur.to = x.iEnd; } } }
if (cur && cur.dd >= 15) eps.push(cur);
const day = (i: number) => new Date(M5[i].t * 1000).toISOString().slice(0, 10);
const er = (k: number, n: number) => { let p = 0; for (let q = k - n + 1; q <= k; q++) p += Math.abs(D1.b[q].c - D1.b[q - 1].c); return Math.abs(D1.b[k].c - D1.b[k - n].c) / p; };
console.log("Episódios de queda ≥ 15R (carteira base):");
for (const e of eps) {
  const tr = e.trades.filter((x: Trade) => x.iEnd <= e.to), longs = tr.filter((x: Trade) => x.d === 1).length;
  const k0 = CI.cD[e.from], k1 = CI.cD[e.to], move = ((D1.b[k1].c - D1.b[k0].c) / D1.b[k0].c) * 100;
  const erP = er(k1, Math.max(5, k1 - k0)); const dirs = tr.reduce((s: number, x: Trade) => s + x.d, 0);
  console.log(`  ${day(e.from)} → ${day(e.to)} · −${e.dd.toFixed(0)}R · ${tr.length} op (${longs} compras/${tr.length - longs} vendas) · ouro ${move >= 0 ? "+" : ""}${move.toFixed(1)}% no período · eficiência do movimento D1 ${erP.toFixed(2)}`);
}
// comparação: eficiência D1 (ER20) e direção nas quedas × fora delas
const inDD = new Set<Trade>(); for (const e of eps) for (const x of e.trades) if (x.iEnd <= e.to) inDD.add(x);
const er20At = (x: Trade) => er(CI.cD[x.i0 - 1], 20);
const avg = (z: number[]) => z.reduce((s, v) => s + v, 0) / z.length;
console.log(`\nEficiência D1 (20 dias) na entrada: nas quedas ${avg([...inDD].map(er20At)).toFixed(2)} · fora delas ${avg(base.filter((x) => !inDD.has(x)).map(er20At)).toFixed(2)}`);
// FREIO 1: pausa pela própria curva (sombra): se a soma das últimas N operações (medidas mesmo pausado) ≤ −X, não opera
function equityBrake(all: Trade[], n: number, x: number) {
  const done: Trade[] = []; const kept: Trade[] = [];
  const sorted = [...all].sort((a, b) => a.i0 - b.i0);
  for (const t of sorted) { const closed = all.filter((y) => y.iEnd <= t.i0).sort((a, b) => a.iEnd - b.iEnd).slice(-n); const s = closed.reduce((q, y) => q + y.R, 0); if (closed.length >= n && s <= -x) continue; kept.push(t); }
  return kept;
}
const raw = run({ name: "raw" });
console.log("\nFREIO pela curva do motor (todas as operações medidas na sombra; escolha pelo treino):");
console.log(fmt("BASE", base));
for (const n of [10, 15, 20]) for (const x of [6, 8, 10, 12]) console.log(fmt(`pausa se últimas ${n} somarem ≤ −${x}R`, portfolio(equityBrake(raw, n, x))));
// FREIO 2: regime — eficiência do D1 baixa (mercado sem direção)
const erAt = (t: Trade, n: number) => er(CI.cD[t.i0 - 1], n);
console.log("\nFREIO por regime (eficiência D1):");
for (const n of [10, 20]) for (const lo of [0.1, 0.15, 0.2, 0.25]) console.log(fmt(`só opera se eficiência D1(${n}) ≥ ${lo}`, portfolio(raw.filter((t) => erAt(t, n) >= lo))));
