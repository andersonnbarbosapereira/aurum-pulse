// Operações da carteira V2 (5 setups) no caminho M5, com horário de entrada/saída e risco em US$ (0,01 lote = US$1/pt).
process.env.NO_SEARCH = "1";
import fs from "node:fs";
const { trig, ctx, ses } = await import("./combo.mts");
const { H1, simulate, M5 } = await import("./lib.mts");
const { I } = await import("./families.mts");
const SPEC = [["velaForca", "D1", "Londres+NY", 1.5], ["recuoEMA20", "H4+D1", "Londres+NY", 1.5], ["canalH1_12", "D1", "todas", 1.5], ["canalH1_24", "H4+D1+naoEsticado", "todas", 2.5], ["canalH4_60", "D1", "todas", 2.5]] as const;
const out: any[] = [];
for (const [tn, cn, sn, sm] of SPEC) {
  const sigs = trig[tn].filter(([k, d]: any) => ctx[cn](k, d) && ses[sn](k)).map(([k, d]: any) => { const i = H1.idx5[k] + 1, a = I.h1.atr[k]; return { i, dir: d, stop: M5[i].c - d * sm * a, tp: null, maxBars: 12 * 240, trail: { atrMult: 6, atr: a }, meta: { atr: a } }; }).filter((s: any) => s.i + 1 < M5.length);
  for (const t of simulate(sigs as any, 0.5)) out.push({ m: tn, t: t.t, end: t.t + t.bars * 300, R: t.R, risk: t.risk, atr: t.meta.atr, px: t.entry });
}
out.sort((a, b) => a.t - b.t);
fs.writeFileSync("bank_trades.json", JSON.stringify(out));
console.log(out.length, "operações");
