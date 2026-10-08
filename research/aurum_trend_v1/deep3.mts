// 3) Perdedoras: sinais de derrota nas primeiras horas (avaliados a cada H1 fechado, só enquanto a operação ainda não andou +1R)
import { run, portfolio, stats, fmt, H1, I, CI, M5, type Policy, type Ctx } from "./deep_base.mts";
const rsi7 = (() => { const c = H1.b.map((x) => x.c), n = 7, o = [50]; let g = 0, l = 0; for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1], u = Math.max(d, 0), w = Math.max(-d, 0); if (i <= n) { g += u / n; l += w / n; } else { g = (g * (n - 1) + u) / n; l = (l * (n - 1) + w) / n; } o.push(l === 0 ? 100 : 100 - 100 / (1 + g / l)); } return o; })();
type Cond = (c: Ctx, k: number) => boolean;
const mk = (name: string, cond: Cond, hours: number, maxMfe = 1): Policy => ({ name: `${name} (até ${hours}h, pico<${maxMfe}R)`, onBar: (c) => {
  const k = CI.c1[c.j]; if (k === c.st.k) return; c.st.k = k; if (k <= c.s.k) return;
  if (c.bars > hours * 12 || c.mfeR >= maxMfe) return; if (cond(c, k)) return { exit: true }; } });
const sigC = (c: Ctx) => H1.b[c.s.k];
const conds: [string, Cond][] = [
  ["H1 devolve a vela de sinal inteira", (c, k) => (H1.b[k].c - sigC(c).o) * c.s.d < 0],
  ["H1 fecha além do meio da vela de sinal", (c, k) => (H1.b[k].c - (sigC(c).o + sigC(c).c) / 2) * c.s.d < 0],
  ["H1 fecha além da EMA20 H1", (c, k) => (H1.b[k].c - I.h1.e20[k]) * c.s.d < 0],
  ["2 H1 seguidos fechando contra", (c, k) => (H1.b[k].c - H1.b[k - 1].c) * c.s.d < 0 && (H1.b[k - 1].c - H1.b[k - 2].c) * c.s.d < 0 && k - 1 > c.s.k],
  ["IFR14 H1 volta para o lado errado de 50", (c, k) => (I.h1.rsi[k] - 50) * c.s.d < 0],
  ["IFR7 H1 lado errado de 40/60", (c, k) => (rsi7[k] - 50) * c.s.d < -10],
  ["H1 fecha além da mín/máx da vela de sinal", (c, k) => (c.s.d === 1 ? H1.b[k].c < sigC(c).l : H1.b[k].c > sigC(c).h)],
  ["rompimento falso: H1 volta para dentro do canal 24h", (c, k) => { if (c.s.m !== "canalH1_24") return false; const lvl = c.s.d === 1 ? Math.max(...H1.b.slice(c.s.k - 24, c.s.k).map((x) => x.h)) : Math.min(...H1.b.slice(c.s.k - 24, c.s.k).map((x) => x.l)); return (H1.b[k].c - lvl) * c.s.d < 0; }],
  ["resultado < −0,5R no fechamento do H1", (c) => c.rNow < -0.5],
];
const out: { name: string; t: any[] }[] = [{ name: "BASE", t: portfolio(run({ name: "base" })) }];
for (const [n, cnd] of conds) for (const h of [2, 6, 24]) out.push({ name: n, t: portfolio(run(mk(n, cnd, h))) });
out.forEach((o, i) => { if (i) o.name = (o.t as any).name ?? o.name; });
// nomes com horas
let idx = 1; for (const [n] of conds) for (const h of [2, 6, 24]) out[idx++].name = `${n} · até ${h}h`;
out.sort((a, b) => stats(b.t).tr / stats(b.t).dd - stats(a.t).tr / stats(a.t).dd);
for (const o of out) console.log(fmt(o.name, o.t));
// quanto "acertam": entre as operações cortadas, quantas iam ganhar
const base = run({ name: "base" });
console.log("\nPrecisão dos sinais de derrota (operações base, avaliado nas primeiras 6h):");
for (const [n, cnd] of conds) {
  let hit = 0, cutWin = 0, cutLossSaved = 0, cutWinLost = 0;
  for (const t of base) { let fired = false, rAt = 0; for (let j = t.i0; j < Math.min(t.iEnd, t.i0 + 72); j++) { const k = CI.c1[j]; if (k <= t.k || k === CI.c1[j - 1]) continue; const mfe = (() => { let b = t.e; for (let q = t.i0; q <= j; q++) b = t.d === 1 ? Math.max(b, M5[q].h) : Math.min(b, M5[q].l); return ((b - t.e) * t.d) / t.risk; })(); if (mfe >= 1) break; const fake: any = { s: { d: t.d, k: t.k, m: t.m }, rNow: ((M5[j].c - t.e) * t.d) / t.risk }; if (cnd(fake, k)) { fired = true; rAt = fake.rNow; break; } }
    if (!fired) continue; hit++; if (t.R > 0) { cutWin++; cutWinLost += t.R - rAt; } else cutLossSaved += rAt - t.R; }
  console.log(`  ${n.padEnd(52)} disparou em ${hit} op · ${((100 * cutWin) / Math.max(1, hit)).toFixed(0)}% delas iam GANHAR · economia nas perdedoras ${cutLossSaved.toFixed(0)}R · lucro perdido nas vencedoras ${cutWinLost.toFixed(0)}R`);
}
