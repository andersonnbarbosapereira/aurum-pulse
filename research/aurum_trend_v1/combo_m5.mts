process.env.NO_SEARCH = "1";
const { trig, ctx, ses } = await import("./combo.mts");
const { H1, simulate, M5 } = await import("./lib.mts");
const { I } = await import("./families.mts");
const SPEC = [
  ["velaForca", "D1", "Londres+NY", 1.5, 6], ["recuoEMA20", "H4+D1", "Londres+NY", 1.5, 6], ["canalH1_12", "D1", "todas", 1.5, 6],
  ["canalH1_24", "H4+D1+naoEsticado", "todas", 2.5, 6], ["canalH4_60", "D1", "todas", 2.5, 6], ["engolfoEMA", "H4+D1", "Londres+NY", 1.5, 6],
  ["rompeDiaAnt", "H4+D1+naoEsticado", "NY", 2.5, 6], ["insideBar", "D1", "Londres+NY", 2.5, 6],
] as const;
const T0 = Date.UTC(2025, 0, 1) / 1000;
const mods = SPEC.map(([tn, cn, sn, sm, tr]) => {
  const sigs = trig[tn].filter(([k, d]: any) => ctx[cn](k, d) && ses[sn](k)).map(([k, d]: any) => { const i = H1.idx5[k] + 1, a = I.h1.atr[k]; return { i, dir: d, stop: M5[i].c - d * sm * a, tp: null, maxBars: 12 * 240, trail: { atrMult: tr, atr: a } }; }).filter((s: any) => s.i + 1 < M5.length);
  return { name: `${tn}|${cn}|${sn}`, t: simulate(sigs as any, 0.5) };
});
function rep(name: string, ms: typeof mods) {
  const t = ms.flatMap((m) => m.t.map((x: any) => ({ ...x, m: m.name }))).sort((a: any, b: any) => a.t - b.t);
  const cur: Record<string, number> = {}; for (const m of ms) { const r = m.t.filter((x: any) => x.t >= T0).map((x: any) => x.risk).sort((a: number, b: number) => a - b); cur[m.name] = r[r.length >> 1]; }
  const mo = new Map<string, { now: number; real: number }>(); for (const x of t) { const k = new Date(x.t * 1000).toISOString().slice(0, 7), o = mo.get(k) ?? { now: 0, real: 0 }; o.now += x.R * cur[x.m]; o.real += x.R * x.risk; mo.set(k, o); }
  const m2 = [...mo.entries()].sort(), now = m2.map(([, v]) => v.now); let e = 0, p = 0, dd = 0; for (const v of now) { e += v; p = Math.max(p, e); dd = Math.max(dd, p - e); }
  const real = m2.filter(([k]) => k >= "2025-01").map(([, v]) => v.real), yrs = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => { const z = m2.filter(([k]) => k.startsWith(String(y))); return z.reduce((s, [, v]) => s + v.now, 0) / z.length; });
  const tr = t.filter((x: any) => new Date(x.t * 1000).getUTCFullYear() <= 2022), va = t.filter((x: any) => { const y = new Date(x.t * 1000).getUTCFullYear(); return y >= 2023 && y <= 2024; }), te = t.filter((x: any) => x.t >= T0);
  const av = (z: any[]) => (z.reduce((s, x) => s + x.R, 0) / z.length).toFixed(2);
  console.log(`${name.padEnd(36)} ${(t.length / 105).toFixed(1).padStart(5)}/mês · ${av(t)}R · tr ${av(tr)} va ${av(va)} te ${av(te)} · US$/mês ${(now.reduce((s, v) => s + v, 0) / now.length).toFixed(0)} · meses+ ${((100 * now.filter((v) => v > 0).length) / now.length).toFixed(0)}% · pior queda ${dd.toFixed(0)} · por ano [${yrs.map((v) => v.toFixed(0)).join(" ")}] · 2025-26 real ${(real.reduce((s, v) => s + v, 0) / real.length).toFixed(0)}/mês`);
}
for (const m of mods) rep(m.name, [m]);
rep("TODOS os 8 (M5)", mods); rep("vela+recuo+canal12+A+B (M5)", mods.slice(0, 5));
