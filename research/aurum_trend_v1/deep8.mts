import { run, portfolio, fmt, stats, H1, CI, type Policy, type Ctx, type Trade } from "./deep_base.mts";
const rsi7 = (() => { const c = H1.b.map((x) => x.c), n = 7, o = [50]; let g = 0, l = 0; for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1], u = Math.max(d, 0), w = Math.max(-d, 0); if (i <= n) { g += u / n; l += w / n; } else { g = (g * (n - 1) + u) / n; l = (l * (n - 1) + w) / n; } o.push(l === 0 ? 100 : 100 - 100 / (1 + g / l)); } return o; })();
const pol = (name: string, rsiLim: number | null, hrs: number, stepR: number | null, stepTrail: number): Policy => ({ name, onBar: (c: Ctx) => {
  const k = CI.c1[c.j];
  if (rsiLim !== null && k !== c.st.k) { c.st.k = k; if (k > c.s.k && c.bars <= hrs * 12 && c.mfeR < 1 && (rsi7[k] - 50) * c.s.d < -rsiLim) return { exit: true }; }
  if (stepR !== null && c.mfeR >= stepR) return { stop: c.best - c.s.d * stepTrail * c.s.a };
} });
const P = (n: string, p: Policy) => console.log(fmt(n, portfolio(run(p))));
P("BASE", { name: "b" });
console.log("— IFR7 contra nas primeiras horas (vizinhança):");
for (const lim of [5, 10, 15]) for (const h of [4, 6, 8]) P(`IFR7 contra > ${lim} até ${h}h`, pol("", lim, h, null, 0));
console.log("— degrau depois de +X R (vizinhança):");
for (const x of [5, 6, 8]) for (const t of [2, 3]) P(`após +${x}R trail ${t} ATR`, pol("", null, 0, x, t));
console.log("— combinação:");
P("IFR7>10 até 6h + após +6R trail 2", pol("", 10, 6, 6, 2));
// saída parcial (precisa de 0,02 lote): metade sai em +X R e a outra metade segue com stop no empate a partir daí
const base = portfolio(run({ name: "b" }));
console.log("\n— saída parcial com 0,02 lote (aproximação nas mesmas operações; resultado por 0,01):");
const show = (n: string, f: (t: Trade) => number) => { const t = base.map((x) => ({ ...x, R: f(x) })); console.log(fmt(n, t)); };
show("sem parcial (0,02 inteiro no stop móvel)", (t) => t.R);
for (const x of [2, 3, 4]) show(`metade em +${x}R, resto empata a partir daí`, (t) => (t.mfe >= x ? 0.5 * x + 0.5 * Math.max(t.R, 0.05) : t.R));
