process.env.NO_SEARCH = "1";
const { trig, ctx, ses, exits, sim } = await import("./combo.mts");
const SPEC = [
  ["velaForca", "D1", "Londres+NY", 1.5, "trail6"], ["recuoEMA20", "H4+D1", "Londres+NY", 1.5, "trail6"], ["canalH1_12", "D1", "todas", 1.5, "trail6"],
  ["canalH1_24", "H4+D1+naoEsticado", "todas", 2.5, "trail6"], ["canalH4_60", "D1", "todas", 2.5, "trail6"], ["engolfoEMA", "H4+D1", "Londres+NY", 1.5, "trail6"],
  ["rompeDiaAnt", "H4+D1+naoEsticado", "NY", 2.5, "trail6"], ["insideBar", "D1", "Londres+NY", 2.5, "trail6"],
] as const;
const T0 = Date.UTC(2025, 0, 1) / 1000;
const mods = SPEC.map(([tn, cn, sn, sm, en]) => ({ name: `${tn}|${cn}|${sn}|${sm}|${en}`, t: sim(trig[tn].filter(([k, d]: any) => ctx[cn](k, d) && ses[sn](k)), sm, exits.find((e: any) => e.name === en)) }));
function rep(name: string, ms: typeof mods, cap = 99) {
  let t = ms.flatMap((m) => m.t.map((x: any) => ({ ...x, m: m.name }))).sort((a: any, b: any) => a.t - b.t);
  if (cap < 99) { const keep: any[] = []; let open: number[] = []; for (const x of t) { open = open.filter((e) => e > x.t); if (open.length >= cap) continue; keep.push(x); open.push(x.end); } t = keep; }
  const cur: Record<string, number> = {}; for (const m of ms) { const r = m.t.filter((x: any) => x.t >= T0).map((x: any) => x.risk).sort((a: number, b: number) => a - b); cur[m.name] = r[r.length >> 1]; }
  const mo = new Map<string, { now: number; real: number }>(); for (const x of t) { const k = new Date(x.t * 1000).toISOString().slice(0, 7), o = mo.get(k) ?? { now: 0, real: 0 }; o.now += x.R * cur[x.m]; o.real += x.R * x.risk; mo.set(k, o); }
  const ms2 = [...mo.entries()].sort(), now = ms2.map(([, v]) => v.now); let e = 0, p = 0, dd = 0; for (const v of now) { e += v; p = Math.max(p, e); dd = Math.max(dd, p - e); }
  const real = ms2.filter(([k]) => k >= "2025-01").map(([, v]) => v.real), yrs = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => { const z = ms2.filter(([k]) => k.startsWith(String(y))); return z.reduce((s, [, v]) => s + v.now, 0) / z.length; });
  let e2 = 0, p2 = 0, dd2 = 0; for (const v of real) { e2 += v; p2 = Math.max(p2, e2); dd2 = Math.max(dd2, p2 - e2); }
  const sorted = [...now].sort((a, b) => a - b);
  console.log(`${name.padEnd(44)} ${(t.length / 105).toFixed(1).padStart(5)} op/mês · ${(t.reduce((s: number, x: any) => s + x.R, 0) / t.length).toFixed(2)}R/op · US$/mês(stop atual) ${(now.reduce((s, v) => s + v, 0) / now.length).toFixed(0)} · meses+ ${((100 * now.filter((v) => v > 0).length) / now.length).toFixed(0)}% · pior mês ${sorted[0].toFixed(0)} · pior queda ${dd.toFixed(0)} · por ano [${yrs.map((v) => v.toFixed(0)).join(" ")}] · 2025-26 real US$ ${(real.reduce((s, v) => s + v, 0) / real.length).toFixed(0)}/mês (queda ${dd2.toFixed(0)})`);
}
for (const m of mods) rep(m.name, [m]);
console.log("— carteiras:");
rep("TODOS os 8", mods);
rep("TODOS os 8, máx 4 abertas", mods, 4);
rep("TODOS os 8, máx 3 abertas", mods, 3);
rep("frequentes: vela+recuo+canal12", mods.slice(0, 3));
rep("vela+recuo+canal12+A+B", mods.slice(0, 5));
rep("vela+recuo+canal12+A+B, máx 3", mods.slice(0, 5), 3);
