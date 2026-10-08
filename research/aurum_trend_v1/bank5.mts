import fs from "node:fs";
const ALL: any[] = JSON.parse(fs.readFileSync("bank_trades.json", "utf8"));
const SET = ["recuoEMA20", "velaForca", "canalH4_60", "canalH1_24"];
function run(trades: any[], lotOf: (b: number) => number, maxOpen = 3, start = 500, capRel = 0.7) {
  let bal = start, peak = start, maxDD = 0, minBal = start, taken = 0, lots: Record<string, number> = {};
  const open: { end: number; pnl: number }[] = []; const monthly = new Map<string, number>();
  const settle = (t: number) => { for (let i = open.length - 1; i >= 0; i--) if (open[i].end <= t) { bal += open[i].pnl; const k = new Date(open[i].end * 1000).toISOString().slice(0, 7); monthly.set(k, (monthly.get(k) ?? 0) + open[i].pnl); open.splice(i, 1); peak = Math.max(peak, bal); maxDD = Math.max(maxDD, peak - bal); minBal = Math.min(minBal, bal); } };
  for (const x of trades) {
    settle(x.t); if (bal < 50) break;
    if (!SET.includes(x.m) || (x.risk / x.px) * 100 > capRel || open.length >= maxOpen) continue;
    const lot = lotOf(bal); lots[lot.toFixed(2)] = (lots[lot.toFixed(2)] ?? 0) + 1;
    open.push({ end: x.end, pnl: x.R * x.risk * lot * 100 }); taken++;
  }
  settle(Infinity);
  return { bal, maxDD, minBal, taken, lots, monthly };
}
const rules: [string, (b: number) => number][] = [
  ["+0,01 a cada US$750 (0,02 em US$1.500, máx 0,05)", (b) => Math.min(0.05, Math.max(0.01, Math.floor(b / 750) / 100))],
  ["0,01 fixo", () => 0.01], ["0,02 a partir de US$1.000", (b) => (b >= 1000 ? 0.02 : 0.01)], ["0,02 a partir de US$1.500", (b) => (b >= 1500 ? 0.02 : 0.01)],
  ["+0,01 a cada US$1.500 (máx 0,05)", (b) => Math.min(0.05, Math.max(0.01, Math.floor(b / 1500) / 100 + (b >= 1500 ? 0 : 0))) || 0.01],
];
const real = ALL.filter((x) => x.t >= Date.UTC(2025, 0, 1) / 1000);
const scaled = ALL.map((x) => ({ ...x, risk: (x.risk * 4100) / x.px, px: 4100 }));
const f = (v: number) => "US$ " + Math.round(v).toLocaleString("pt-BR");
for (const [name, lf] of rules) {
  const A = run(real, lf);
  const mv = [...A.monthly.values()];
  console.log(`\n${name}\n  2025-01 → 2026-09 (real): ${f(500)} → ${f(A.bal)} · ${A.taken} op · menor saldo ${f(A.minBal)} · maior queda ${f(A.maxDD)} · meses+ ${mv.filter((v) => v > 0).length}/${mv.length} · média ${f(mv.reduce((s, v) => s + v, 0) / mv.length)}/mês · lotes ${JSON.stringify(A.lots)}`);
  const W: any[] = []; for (let y = 2018; y <= 2025; y++) for (const m of [0, 3, 6, 9]) { const a = Date.UTC(y, m, 1) / 1000, b = Date.UTC(y + 1, m, 1) / 1000; if (b > Date.UTC(2026, 9, 1) / 1000) continue; W.push({ y, m, ...run(scaled.filter((x) => x.t >= a && x.t < b), lf) }); }
  const fin = W.map((w) => w.bal).sort((a, b) => a - b);
  console.log(`  ${W.length} janelas de 12 meses (2018–2026, a preço de hoje): mediana ${f(fin[fin.length >> 1])} · pior ${f(fin[0])} · melhor ${f(fin[fin.length - 1])} · terminou abaixo de US$500 em ${W.filter((w) => w.bal < 500).length} · saldo chegou abaixo de US$250 em ${W.filter((w) => w.minBal < 250).length} · abaixo de US$150 em ${W.filter((w) => w.minBal < 150).length}`);
  if (name === "0,01 fixo") for (const w of W.filter((w) => w.minBal < 300)) console.log(`     janela ${w.y}-${String(w.m + 1).padStart(2, "0")}: final ${f(w.bal)}, menor saldo ${f(w.minBal)}`);
}
