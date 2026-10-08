import { H4, simulate, line, type Sig } from "./lib.mts";
import { F2, F2b, F1b, I, CI } from "./families.mts";
const ext = (s: Sig) => { const k4 = CI.c4[s.i]; return ((H4.b[k4].c - I.h4.e50[k4]) / I.h4.atr[k4]) * s.dir; };
const P = { part: { frac: 0.33, R: 2 } };
const A = F2b({ n: 24, stopAtr: 2.5, trail: 6, flt: "both" }).filter((s) => ext(s) <= 2.5).map((s) => ({ ...s, ...P }));
const B = F2({ n: 60, stopAtr: 2.5, trail: 4, d1: true });
const C0 = F1b({ rsiTh: 45, look: 4, trail: 4, d1: true });
console.log("C com filtro 'não perseguir':"); for (const m of [99, 3, 2.5, 2]) console.log(line(`C ext ≤ ${m}`, simulate(C0.filter((s) => ext(s) <= m) as any)));
const C = C0.filter((s) => ext(s) <= 2.5);
for (const cost of [0.5, 1.0, 2.0]) {
  const t = [...simulate(A as any, cost), ...simulate(B as any, cost), ...simulate(C as any, cost)].sort((a, b) => a.t - b.t);
  console.log(line(`A+B+C · custo ${cost} pt`, t));
  const tab = [...simulate(A as any, cost), ...simulate(B as any, cost)].sort((a, b) => a.t - b.t); console.log(line(`A+B · custo ${cost} pt`, tab));
  if (cost === 0.5) {
    const r = t.map((x) => x.R); let s = 7; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); const dd: number[] = [], mu: number[] = [];
    for (let k = 0; k < 4000; k++) { const q = [...r]; for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; } let e = 0, p = 0, d = 0; for (const v of q) { e += v; p = Math.max(p, e); d = Math.max(d, p - e); } dd.push(d); let m = 0; for (let i = 0; i < r.length; i++) m += r[Math.floor(rnd() * r.length)]; mu.push(m / r.length); }
    dd.sort((a, b) => a - b); mu.sort((a, b) => a - b);
    console.log(`   Monte Carlo A+B+C: DD mediano ${dd[2000].toFixed(0)}R · 95% ${dd[3800].toFixed(0)}R · bootstrap média 5% ${mu[200].toFixed(2)} · P(média≤0) ${(mu.filter((v) => v <= 0).length / 40).toFixed(1)}%`);
    const L = t.filter((x) => x.dir === 1), S = t.filter((x) => x.dir === -1); console.log(line("   só COMPRAS", L)); console.log(line("   só VENDAS", S));
    const months = new Map<string, number>(); for (const x of t) { const k = new Date(x.t * 1000).toISOString().slice(0, 7); months.set(k, (months.get(k) ?? 0) + x.R); }
    console.log(`   meses positivos ${(100 * [...months.values()].filter((v) => v > 0).length / months.size).toFixed(0)}% de ${months.size}`);
  }
}
