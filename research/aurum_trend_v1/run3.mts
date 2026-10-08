import { simulate, line } from "./lib.mts";
import { F2b } from "./families.mts";
const base = F2b({ n: 24, stopAtr: 2.5, trail: 6, flt: "both" });
const v = (name: string, f: (s: any) => any) => { const t = simulate(base.map((s) => f({ ...s }))); console.log(line(name, t), `acerto ${(100 * t.filter((x) => x.R > 0).length / t.length).toFixed(0)}% · duração mediana ${(t.map((x) => x.bars).sort((a, b) => a - b)[t.length >> 1] / 12).toFixed(0)}h`); };
v("base: trail 6 ATR", (s) => s);
for (const tp of [1.5, 2, 3, 5]) v(`alvo fixo ${tp}R (até 5 dias)`, (s) => ({ ...s, trail: null, tpR: tp, maxBars: 12 * 24 * 5 }));
for (const [fr, r] of [[0.5, 1], [0.5, 1.5], [0.33, 2]]) v(`parcial ${fr * 100}% em ${r}R + stop no 0 + trail 6`, (s) => ({ ...s, part: { frac: fr, R: r } }));
