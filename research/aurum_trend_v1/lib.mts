// Laboratório: dados HistData (M5 base, UTC), agregados causais, indicadores, simulador com custo.
import fs from "node:fs";
export type Bar = { t: number; o: number; h: number; l: number; c: number };
const raw: number[][] = JSON.parse(fs.readFileSync(new URL("./m5.json", import.meta.url), "utf8"));
export const M5: Bar[] = raw.map(([t, o, h, l, c]) => ({ t, o, h, l, c }));

// agregação por período (D1 usa o "dia de negociação" que vira às 17h NY, como as corretoras)
function nyOffset(t: number) {
  const d = new Date(t * 1000), y = d.getUTCFullYear();
  const mar = new Date(Date.UTC(y, 2, 1)), s = Date.UTC(y, 2, 1 + ((7 - mar.getUTCDay()) % 7) + 7, 7) / 1000;
  const nov = new Date(Date.UTC(y, 10, 1)), e = Date.UTC(y, 10, 1 + ((7 - nov.getUTCDay()) % 7), 6) / 1000;
  return t >= s && t < e ? -4 : -5;
}
export const nyHour = (t: number) => { const h = new Date((t + nyOffset(t) * 3600) * 1000); return h.getUTCHours() + h.getUTCMinutes() / 60; };
export const brHour = (t: number) => { const h = new Date((t - 3 * 3600) * 1000); return h.getUTCHours() + h.getUTCMinutes() / 60; };
const tradeDay = (t: number) => Math.floor((t + nyOffset(t) * 3600 + 7 * 3600) / 86400); // dia que começa 17h NY

export type TF = { b: Bar[]; end: number[]; idx5: Int32Array }; // idx5[i] = índice do último M5 fechado do candle i
function aggregate(keyOf: (t: number) => number): TF {
  const b: Bar[] = [], end: number[] = [], last: number[] = [];
  let k = NaN;
  M5.forEach((x, i) => { const kk = keyOf(x.t); if (kk !== k) { b.push({ ...x }); last.push(i); end.push(x.t + 300); k = kk; } else { const c = b[b.length - 1]; c.h = Math.max(c.h, x.h); c.l = Math.min(c.l, x.l); c.c = x.c; last[last.length - 1] = i; end[end.length - 1] = x.t + 300; } });
  return { b, end, idx5: Int32Array.from(last) };
}
export const M15 = aggregate((t) => Math.floor(t / 900));
export const H1 = aggregate((t) => Math.floor(t / 3600));
export const H4 = aggregate((t) => Math.floor((t + 3600) / 14400)); // blocos 23,3,7,11,15,19 UTC
export const D1 = aggregate(tradeDay);
// para cada M5 i: índice do último candle FECHADO do TF (fechado = seu último M5 é ≤ i)
export function closedIndex(tf: TF): Int32Array {
  const out = new Int32Array(M5.length).fill(-1); let j = -1;
  // conservador: o candle j só conta como fechado depois que o PRÓXIMO M5 começou (idx5[j] < i) — atraso de até 5 min, zero olhada no futuro
  for (let i = 0; i < M5.length; i++) { while (j + 1 < tf.idx5.length && tf.idx5[j + 1] < i) j++; out[i] = j; }
  return out;
}

export const ema = (v: number[], n: number) => { const k = 2 / (n + 1), o = new Array(v.length); v.forEach((x, i) => (o[i] = i ? x * k + o[i - 1] * (1 - k) : x)); return o as number[]; };
export const sma = (v: number[], n: number) => { const o = new Array(v.length).fill(NaN); let s = 0; v.forEach((x, i) => { s += x; if (i >= n) s -= v[i - n]; if (i >= n - 1) o[i] = s / n; }); return o as number[]; };
export const atr = (b: Bar[], n = 14) => { const o: number[] = []; b.forEach((x, i) => { const tr = i ? Math.max(x.h - x.l, Math.abs(x.h - b[i - 1].c), Math.abs(x.l - b[i - 1].c)) : x.h - x.l; o.push(i < n ? (i ? (o[i - 1] * i + tr) / (i + 1) : tr) : (o[i - 1] * (n - 1) + tr) / n); }); return o; };
export const rsi = (v: number[], n = 14) => { const o = [50]; let g = 0, l = 0; for (let i = 1; i < v.length; i++) { const d = v[i] - v[i - 1], u = Math.max(d, 0), w = Math.max(-d, 0); if (i <= n) { g += u / n; l += w / n; } else { g = (g * (n - 1) + u) / n; l = (l * (n - 1) + w) / n; } o.push(l === 0 ? 100 : 100 - 100 / (1 + g / l)); } return o; };
export const adx = (b: Bar[], n = 14) => { const o: number[] = [20]; let tr = 0, p = 0, m = 0, a = 20; for (let i = 1; i < b.length; i++) { const up = b[i].h - b[i - 1].h, dn = b[i - 1].l - b[i].l, t = Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c)); tr = tr - tr / n + t; p = p - p / n + (up > dn && up > 0 ? up : 0); m = m - m / n + (dn > up && dn > 0 ? dn : 0); const pd = (100 * p) / (tr || 1), md = (100 * m) / (tr || 1), dx = (100 * Math.abs(pd - md)) / (pd + md || 1); a = (a * (n - 1) + dx) / n; o.push(a); } return o; };

// ---------- Simulador ----------
export type Sig = { i: number; dir: 1 | -1; stop: number; tp: number | null; maxBars: number; tag?: string; trail?: { atrMult: number; atr: number } | null; be?: number | null; meta?: any };
export type Trade = { t: number; dir: 1 | -1; entry: number; risk: number; R: number; bars: number; tag?: string; meta?: any; exit: string };
export const COST = Number(process.env.COST ?? 0.5); // pontos por operação (spread+derrapagem)
/** Entra na ABERTURA do M5 seguinte ao sinal. Stop tem prioridade no mesmo candle. Uma posição por vez por família. */
export function simulate(sigs: Sig[], cost = COST, maxOpen = 1): Trade[] {
  const out: Trade[] = []; let busyUntil = -1; const opens: number[] = [];
  for (let s of sigs.sort((a, b) => a.i - b.i)) {
    if (s.i + 1 >= M5.length) continue;
    if (maxOpen === 1) { if (s.i <= busyUntil) continue; } else { for (let q = opens.length - 1; q >= 0; q--) if (opens[q] < s.i) opens.splice(q, 1); if (opens.length >= maxOpen) continue; }
    const e = M5[s.i + 1].o, risk = Math.abs(e - s.stop);
    if (!(risk > 0) || (s.dir === 1 ? s.stop >= e : s.stop <= e)) continue;
    if ((s as any).tpR) s = { ...s, tp: e + s.dir * (s as any).tpR * risk };
    // parcial: fecha `part` da posição em +partR e deixa o resto correr no trailing
    const part = (s as any).part as { frac: number; R: number } | undefined; let banked = 0, partDone = false;
    let stop = s.stop, R = NaN, j = s.i + 1, why = "time", best = e;
    for (; j < Math.min(M5.length, s.i + 1 + s.maxBars); j++) {
      const b = M5[j];
      if (j > s.i + 1 && Math.abs(b.t - M5[j - 1].t) > 4 * 86400) { R = ((M5[j - 1].c - e) * s.dir) / risk; why = "gap"; break; }
      if (s.dir === 1 ? b.l <= stop : b.h >= stop) { R = ((stop - e) * s.dir) / risk; why = stop === s.stop ? "stop" : "trail"; break; }
      if (s.tp !== null && (s.dir === 1 ? b.h >= s.tp : b.l <= s.tp)) { R = ((s.tp - e) * s.dir) / risk; why = "tp"; break; }
      best = s.dir === 1 ? Math.max(best, b.h) : Math.min(best, b.l);
      if (part && !partDone && ((best - e) * s.dir) / risk >= part.R) { partDone = true; banked = part.frac * part.R; stop = s.dir === 1 ? Math.max(stop, e) : Math.min(stop, e); }
      if (s.be != null && ((best - e) * s.dir) / risk >= s.be) stop = s.dir === 1 ? Math.max(stop, e) : Math.min(stop, e);
      if (s.trail) { const ts = best - s.dir * s.trail.atrMult * s.trail.atr; stop = s.dir === 1 ? Math.max(stop, ts) : Math.min(stop, ts); }
    }
    if (!Number.isFinite(R)) { j = Math.min(j, M5.length - 1); R = ((M5[j].c - e) * s.dir) / risk; }
    if (part && partDone) R = banked + (1 - part.frac) * R;
    out.push({ t: M5[s.i].t, dir: s.dir, entry: e, risk, R: R - cost / risk, bars: j - s.i, tag: s.tag, meta: s.meta, exit: why });
    busyUntil = j; opens.push(j);
  }
  return out;
}

// ---------- Relatório ----------
const sg = (v: number) => (Number.isFinite(v) ? (v >= 0 ? "+" : "") + v.toFixed(2) : "  — ");
export const PERIODS = { train: [2018, 2022], valid: [2023, 2024], test: [2025, 2026] } as const;
const yr = (t: number) => new Date(t * 1000).getUTCFullYear();
export function stats(tr: Trade[]) {
  const n = tr.length, R = tr.map((x) => x.R), a = n ? R.reduce((s, v) => s + v, 0) / n : NaN, sd = Math.sqrt(R.reduce((s, v) => s + (v - a) ** 2, 0) / Math.max(1, n));
  const gw = R.filter((v) => v > 0).reduce((s, v) => s + v, 0), gl = -R.filter((v) => v <= 0).reduce((s, v) => s + v, 0);
  let eq = 0, pk = 0, dd = 0; for (const v of R) { eq += v; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  const by = (lo: number, hi: number) => { const z = tr.filter((x) => yr(x.t) >= lo && yr(x.t) <= hi); return z.length ? z.reduce((s, x) => s + x.R, 0) / z.length : NaN; };
  const years: Record<number, number> = {}; for (let y = 2018; y <= 2026; y++) years[y] = by(y, y);
  return { n, avg: a, pf: gw / (gl || 1e-9), t: a / (sd / Math.sqrt(Math.max(1, n))), dd, win: R.filter((v) => v > 0).length / Math.max(1, n), train: by(2018, 2022), valid: by(2023, 2024), test: by(2025, 2026), years, perDay: n / 2250, posYears: Object.values(years).filter((v) => v > 0).length };
}
export function line(name: string, tr: Trade[]) {
  const s = stats(tr);
  return `${name.padEnd(46)} ${String(s.n).padStart(5)} op ${s.perDay.toFixed(2)}/d · ${sg(s.avg)}R PF ${s.pf.toFixed(2)} t=${s.t.toFixed(1)} DD ${s.dd.toFixed(0)} · tr ${sg(s.train)} va ${sg(s.valid)} te ${sg(s.test)} · anos+ ${s.posYears}/9 [${Object.values(s.years).map(sg).join(" ")}]`;
}
export { sg };
