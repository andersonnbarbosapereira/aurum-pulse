process.env.NO_SEARCH = "1";
const { trig, ctx, ses } = await import("./combo.mts");
import { run, portfolio, fmt, stats, H1, M5, I, type Trade, type Sig } from "./deep_base.mts";
const mk = (tn: string, cn: string, sn: string, sm: number): Sig[] => (trig[tn] as [number, 1 | -1][]).filter(([k, d]) => ctx[cn](k, d) && ses[sn](k)).map(([k, d]) => ({ m: tn, k, i: H1.idx5[k] + 1, d, a: I.h1.atr[k], sm })).filter((s) => s.i + 2 < M5.length && s.a > 0 && (process.env.NOCAP ? true : ((sm * s.a) / M5[s.i].c) * 100 <= 0.7));
// carteira ALVO FIXO: um setup por gatilho (o melhor no treino com validação > 0 na busca)
const TP = [
  ["canalH1_24", "H4+D1+naoEsticado", "semAsia", 2.5, 2.5, 120], ["canalH4_60", "H4+D1", "Londres+NY", 2.5, 2.5, 120], ["canalH1_48", "H4+D1", "NY", 2.5, 2, 120],
  ["rompeDiaAnt", "H4+D1+naoEsticado", "NY", 2.5, 1.5, 120], ["velaForca", "H4+D1", "NY", 2, 2.5, 120], ["canalH1_12", "H4+D1+naoEsticado", "semAsia", 2.5, 2.5, 120], ["recuoEMA20", "D1", "semAsia", 2.5, 2.5, 120],
] as const;
const T0 = Date.UTC(2025, 0, 1) / 1000;
const usd = (t: Trade[]) => t.filter((x) => x.t >= T0).reduce((s, x) => s + x.R * x.risk * (4100 / x.e), 0) / 21;
const usdAll = (t: Trade[]) => t.reduce((s, x) => s + x.R * x.risk * (4100 / x.e), 0) / 105;
const usdDD = (t: Trade[]) => { const z = [...t].sort((a, b) => a.iEnd - b.iEnd); let eq = 0, pk = 0, dd = 0; for (const x of z) { eq += x.R * x.risk * (4100 / x.e); pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); } return dd; };
const show = (n: string, t: Trade[]) => console.log(fmt(n, t), `· ${(t.length / 105).toFixed(1)} op/mês · US$/mês 2018–26 ${usdAll(t).toFixed(0)} · 2025–26 ${usd(t).toFixed(0)} · pior queda US$ ${usdDD(t).toFixed(0)}`);
const each = TP.map(([tn, cn, sn, sm, tp, mh]) => run({ name: tn, tpR: tp, stopAtr: sm, maxH: mh, noTrail: true }, mk(tn, cn, sn, sm)));
TP.forEach((x, i) => show(`  ${x[0]} alvo ${x[4]}R`, each[i]));
for (const mo of [3, 5]) show(`CARTEIRA ALVO FIXO (7 setups, máx ${mo})`, portfolio(each.flat(), mo));
const v2 = portfolio(run({ name: "v2" }));
show("MOTOR ATUAL V2 (stop móvel)", v2);
// híbrido (0,02 lote): metade sai no alvo de 2,5R, metade segue no stop móvel — mesmas entradas do V2
const half = run({ name: "h", tpR: 2.5 });
const full = run({ name: "f" });
const byKey = new Map(full.map((x) => [x.m + x.i0, x]));
const hyb = half.filter((x) => byKey.has(x.m + x.i0)).map((x) => { const f = byKey.get(x.m + x.i0)!; return { ...f, R: x.why === "alvo" ? 0.5 * 2.5 + 0.5 * Math.max(f.R, 0) : f.R }; });
show("HÍBRIDO 0,02: metade no alvo 2,5R + metade no stop móvel (empate após o alvo)", portfolio(hyb));
