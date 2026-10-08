import fs from "node:fs";
const ALL: any[] = JSON.parse(fs.readFileSync("bank_trades.json", "utf8"));
type Rule = { cap: number; openPct: number; lot: (bal: number) => number; name: string };
function run(trades: any[], rule: Rule, start = 500) {
  // eventos em ordem: entradas e saídas; saldo atualiza na saída
  let bal = start, peak = start, maxDD = 0, minBal = start, taken = 0, skippedCap = 0, skippedOpen = 0;
  const open: { end: number; riskUsd: number; pnl: number }[] = [];
  const settle = (t: number) => { for (let i = open.length - 1; i >= 0; i--) if (open[i].end <= t) { bal += open[i].pnl; open.splice(i, 1); peak = Math.max(peak, bal); maxDD = Math.max(maxDD, (peak - bal) / peak); minBal = Math.min(minBal, bal); } };
  for (const x of trades) {
    settle(x.t);
    if (bal < 100) break; // banca quebrada
    if (x.risk > rule.cap) { skippedCap++; continue; }
    const lot = rule.lot(bal), riskUsd = x.risk * lot * 100; // risk = US$ por 0,01 lote
    const openRisk = open.reduce((s, o) => s + o.riskUsd, 0);
    if (openRisk + riskUsd > (rule.openPct / 100) * bal) { skippedOpen++; continue; }
    open.push({ end: x.end, riskUsd, pnl: x.R * riskUsd }); taken++;
  }
  settle(Infinity);
  return { bal, maxDD, minBal, taken, skippedCap, skippedOpen };
}
const lotRules: Record<string, (b: number) => number> = {
  "fixo 0,01": () => 0.01,
  "0,02 a partir de US$1.000": (b) => (b >= 1000 ? 0.02 : 0.01),
  "0,02 a partir de US$1.500": (b) => (b >= 1500 ? 0.02 : 0.01),
  "0,01 por US$500 (máx 0,05)": (b) => Math.min(0.05, Math.max(0.01, Math.floor(b / 500) / 100)),
  "0,01 por US$1.000 (máx 0,05)": (b) => Math.min(0.05, Math.max(0.01, Math.floor(b / 1000) / 100)),
};
// cenário A: 2025-01 → 2026-09, valores reais
const real = ALL.filter((x) => x.t >= Date.UTC(2025, 0, 1) / 1000);
// cenário B: janelas de 12 meses 2018–2026, risco ajustado ao preço de hoje (stop relativo constante)
const scaled = ALL.map((x) => ({ ...x, risk: (x.risk * 4100) / x.px }));
const windows: any[][] = []; for (let y = 2018; y <= 2025; y++) for (const m of [0, 6]) { const a = Date.UTC(y, m, 1) / 1000, b = Date.UTC(y + 1, m, 1) / 1000; if (b > Date.UTC(2026, 9, 1) / 1000) continue; windows.push(scaled.filter((x) => x.t >= a && x.t < b)); }
const res: any[] = [];
for (const cap of [15, 20, 25, 30, 35, 40, 60, 9999]) for (const openPct of [15, 20, 30]) for (const [ln, lf] of Object.entries(lotRules)) {
  const rule = { cap, openPct, lot: lf, name: `teto US$${cap === 9999 ? "∞" : cap} · aberto ≤${openPct}% · ${ln}` };
  const A = run(real, rule);
  const W = windows.map((w) => run(w, rule));
  const fin = W.map((w) => w.bal).sort((a, b) => a - b), dd = W.map((w) => w.maxDD).sort((a, b) => a - b);
  res.push({ name: rule.name, cap, openPct, ln, A, wMed: fin[fin.length >> 1], wWorst: fin[0], wLoss: W.filter((w) => w.bal < 500).length, wN: W.length, ddMed: dd[dd.length >> 1], ddWorst: dd[dd.length - 1], minBalWorst: Math.min(...W.map((w) => w.minBal)) });
}
fs.writeFileSync("bank_res.json", JSON.stringify(res));
const f = (v: number) => "US$ " + v.toFixed(0);
const show = (r: any) => console.log(`${r.name.padEnd(62)} | 2025–26 real: final ${f(r.A.bal)} (mín ${f(r.A.minBal)}, queda ${(r.A.maxDD * 100).toFixed(0)}%, ${r.A.taken} op) | janelas 12m: mediana ${f(r.wMed)}, pior ${f(r.wWorst)}, perdeu em ${r.wLoss}/${r.wN}, queda mediana ${(r.ddMed * 100).toFixed(0)}% pior ${(r.ddWorst * 100).toFixed(0)}%, menor saldo ${f(r.minBalWorst)}`);
console.log("— efeito do TETO de risco (aberto ≤20%, lote fixo 0,01):"); for (const r of res.filter((r) => r.openPct === 20 && r.ln === "fixo 0,01")) show(r);
console.log("— efeito do limite de risco ABERTO (teto US$30, 0,01 fixo):"); for (const r of res.filter((r) => r.cap === 30 && r.ln === "fixo 0,01")) show(r);
console.log("— regras de LOTE (teto US$30, aberto ≤20%):"); for (const r of res.filter((r) => r.cap === 30 && r.openPct === 20)) show(r);
console.log("— 10 melhores pela mediana das janelas, exigindo pior janela ≥ US$450 e pior queda ≤ 35%:");
for (const r of res.filter((r) => r.wWorst >= 450 && r.ddWorst <= 0.35).sort((a, b) => b.wMed - a.wMed).slice(0, 10)) show(r);
