// 2) Gestão: proteções testadas nas MESMAS entradas. Escolha pelo treino (2018–22).
import { run, portfolio, stats, fmt, H1, H4, I, CI, M5, type Policy, type Ctx } from "./deep_base.mts";
const pols: Policy[] = [{ name: "base trail 6 ATR" }];
const be = (x: number, buf = 0.1) => (c: Ctx) => (c.mfeR >= x ? { stop: c.e + c.s.d * buf * c.risk } : undefined);
for (const x of [1, 1.5, 2, 2.5, 3]) pols.push({ name: `empate em +${x}R`, onBar: be(x) });
for (const t of [3, 4, 5]) pols.push({ name: `trail ${t} ATR`, trail: t });
// degraus: depois de +X R, trailing passa a k ATR
for (const [x, k] of [[2, 4], [3, 4], [3, 3], [4, 3], [5, 3], [4, 2], [6, 2]]) pols.push({ name: `degrau: após +${x}R trail ${k} ATR`, onBar: (c) => (c.mfeR >= x ? { stop: c.best - c.s.d * k * c.s.a } : undefined) });
// trava de lucro: depois de +X, nunca devolver mais que g do pico
for (const [x, g] of [[2, 0.5], [3, 0.5], [3, 0.4], [4, 0.4], [3, 0.3], [5, 0.3]]) pols.push({ name: `trava: após +${x}R devolve no máx ${g * 100}%`, onBar: (c) => (c.mfeR >= x ? { stop: c.e + c.s.d * c.risk * c.mfeR * (1 - g) } : undefined) });
// saída por indicador depois de +X R: H1 fecha do lado errado da EMA20 / EMA50; H4 vira
const h1Exit = (x: number, which: "e20" | "e50") => (c: Ctx) => { const k = CI.c1[c.j]; if (k === c.st.k) return; c.st.k = k; if (c.mfeR < x) return; const v = I.h1[which][k]; if ((H1.b[k].c - v) * c.s.d < 0) return { exit: true }; };
for (const x of [1, 2, 3]) { pols.push({ name: `após +${x}R sai se H1 fechar além da EMA20`, onBar: h1Exit(x, "e20") }); pols.push({ name: `após +${x}R sai se H1 fechar além da EMA50`, onBar: h1Exit(x, "e50") }); }
const h4flip = (c: Ctx) => { const k = CI.c4[c.j]; if (k === c.st.k4) return; c.st.k4 = k; const tr = I.h4.e20[k] > I.h4.e50[k] && H4.b[k].c > I.h4.e50[k] ? 1 : I.h4.e20[k] < I.h4.e50[k] && H4.b[k].c < I.h4.e50[k] ? -1 : 0; if (tr === -c.s.d) return { exit: true }; };
pols.push({ name: "sai se a tendência H4 virar contra", onBar: h4flip });
// exaustão: preço > Z ATR(H1) da EMA20 H1 → trailing 2 ATR
for (const z of [3, 4, 5]) pols.push({ name: `exaustão: >${z} ATR da EMA20 H1 → trail 2 ATR`, onBar: (c) => { const k = CI.c1[c.j]; if ((M5[c.j].c - I.h1.e20[k]) * c.s.d > z * c.s.a) c.st.ex = true; if (c.st.ex) return { stop: c.best - c.s.d * 2 * c.s.a }; } });
// sem avanço: depois de N horas, se o pico < Y R → sai
for (const [h, y] of [[1, 0.3], [2, 0.5], [4, 0.5], [4, 1], [8, 1], [12, 1]]) pols.push({ name: `sem avanço: ${h}h e pico < ${y}R → sai`, onBar: (c) => (c.bars === h * 12 && c.mfeR < y ? { exit: true } : undefined) });
const rows = pols.map((p) => ({ p, t: portfolio(run(p)) }));
rows.sort((a, b) => stats(b.t).tr / stats(b.t).dd - stats(a.t).tr / stats(a.t).dd);
for (const r of rows) console.log(fmt(r.p.name, r.t));
