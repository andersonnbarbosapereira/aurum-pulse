// Busca combinatória só com ALVO FIXO (1,5 / 2 / 2,5R), mínimo 1:1,5. Escolha pelo treino 2018–22.
process.env.NO_SEARCH = "1";
import fs from "node:fs";
const { trig, ctx, ses, sim } = await import("./combo.mts");
const { H1, D1, nyHour, rsi } = await import("./lib.mts");
const { I, CI } = await import("./families.mts");
// gatilhos extras de RECUO (combinam com alvo fixo)
const b = H1.b, N = b.length, e50 = I.h1.e50, e20 = I.h1.e20, r14 = I.h1.rsi, r2 = rsi(b.map((x) => x.c), 2), r5 = rsi(b.map((x) => x.c), 5);
const push = (n: string, k: number, d: number) => ((trig[n] ??= []).push([k, d]));
for (let k = 230; k < N - 1; k++) {
  const x = b[k], p = b[k - 1];
  for (const d of [1, -1]) {
    // toque na EMA50 H1 e vela de rejeição (fecha de volta a favor)
    if ((d === 1 ? x.l <= e50[k] && x.c > e50[k] && x.c > x.o : x.h >= e50[k] && x.c < e50[k] && x.c < x.o)) push("recuoEMA50", k, d);
    // IFR14 H1 saiu de sobrevenda/sobrecompra a favor (cruza 40/60)
    if (d === 1 ? r14[k - 1] < 40 && r14[k] >= 40 : r14[k - 1] > 60 && r14[k] <= 60) push("ifr14volta", k, d);
    // IFR5 extremo e vela a favor
    if (d === 1 ? r5[k - 1] < 20 && x.c > x.o : r5[k - 1] > 80 && x.c < x.o) push("ifr5vira", k, d);
    // pin bar a favor tocando EMA20
    const rg = x.h - x.l || 1, body = Math.abs(x.c - x.o);
    if (body / rg < 0.35 && (d === 1 ? (Math.min(x.o, x.c) - x.l) / rg > 0.55 && x.l <= e20[k] : (x.h - Math.max(x.o, x.c)) / rg > 0.55 && x.h >= e20[k])) push("pinEMA20", k, d);
  }
}
const exits: any[] = []; for (const tp of [1.5, 2, 2.5]) for (const mh of [12, 24, 48, 120]) exits.push({ name: `alvo${tp}R_${mh}h`, tp, maxH: mh });
const stops = [1, 1.5, 2, 2.5];
const yr = (t: number) => new Date(t * 1000).getUTCFullYear();
const res: any[] = [];
for (const tn of Object.keys(trig)) for (const [cn, cf] of Object.entries(ctx) as any) for (const [sn, sf] of Object.entries(ses) as any) {
  const sigs = trig[tn].filter(([k, d]: any) => cf(k, d) && sf(k)); if (sigs.length < 80) continue;
  for (const sm of stops) for (const ex of exits) {
    const t = sim(sigs, sm, ex); if (t.length < 80) continue;
    const g = (lo: number, hi: number) => { const z = t.filter((x: any) => yr(x.t) >= lo && yr(x.t) <= hi); return { n: z.length, a: z.length ? z.reduce((s: number, x: any) => s + x.R, 0) / z.length : NaN }; };
    const years = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => g(y, y).a);
    const rec = t.filter((x: any) => x.t >= Date.UTC(2025, 0, 1) / 1000);
    res.push({ name: `${tn} | ${cn} | ${sn} | stop${sm} | ${ex.name}`, n: t.length, perMonth: t.length / 105, win: t.filter((x: any) => x.R > 0).length / t.length, tr: g(2018, 2022), va: g(2023, 2024), te: g(2025, 2026), years, usdRec: rec.reduce((s: number, x: any) => s + x.R * x.risk, 0) / 21 });
  }
}
fs.writeFileSync("combo_tp_out.json", JSON.stringify(res));
const sg = (v: number) => (Number.isFinite(v) ? (v >= 0 ? "+" : "") + v.toFixed(2) : " — ");
const S = res.filter((r) => r.tr.n >= 60 && r.tr.a >= 0.08 && r.years.slice(0, 5).filter((v: number) => v > 0).length >= 4);
console.log(`combinações ${res.length} · passam no treino (média ≥ +0,08R, ≥4/5 anos +): ${S.length} · destas, validação>0 ${S.filter((r) => r.va.a > 0).length} · teste>0 ${S.filter((r) => r.te.a > 0).length} · ambos ${S.filter((r) => r.va.a > 0 && r.te.a > 0).length}`);
const line = (r: any) => `${r.name.padEnd(62)} ${r.perMonth.toFixed(1).padStart(4)}/mês · acerto ${(r.win * 100).toFixed(0)}% · tr ${sg(r.tr.a)} va ${sg(r.va.a)} te ${sg(r.te.a)} · anos [${r.years.map(sg).join(" ")}] · 2025-26 US$ ${r.usdRec.toFixed(0)}/mês`;
console.log("\nTOP 25 pelo treino (com validação > 0):"); for (const r of S.filter((r) => r.va.a > 0).sort((a, b) => b.tr.a - a.tr.a).slice(0, 25)) console.log(line(r));
console.log("\nMelhor por gatilho:"); const byT = new Map<string, any>(); for (const r of S.filter((r) => r.va.a > 0)) { const t = r.name.split(" | ")[0]; if (!byT.has(t) || byT.get(t).tr.a < r.tr.a) byT.set(t, r); } for (const r of [...byT.values()].sort((a, b) => b.tr.a - a.tr.a)) console.log(line(r));
console.log("\nMais frequentes aprovadas (≥ 5/mês):"); for (const r of S.filter((r) => r.va.a > 0 && r.te.a > 0 && r.perMonth >= 5).sort((a, b) => b.tr.a * b.perMonth - a.tr.a * a.perMonth).slice(0, 12)) console.log(line(r));
