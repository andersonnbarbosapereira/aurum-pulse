// 4) Filtros de entrada: indicadores em várias configurações e tempos gráficos + padrões gráficos + números redondos.
import fs from "node:fs";
import { run, H1, H4, D1, M5, I, CI, type Trade } from "./deep_base.mts";
type Bar = { t: number; o: number; h: number; l: number; c: number };
const ema = (v: number[], n: number) => { const k = 2 / (n + 1), o: number[] = []; v.forEach((x, i) => o.push(i ? x * k + o[i - 1] * (1 - k) : x)); return o; };
const sma = (v: number[], n: number) => { const o: number[] = []; let s = 0; v.forEach((x, i) => { s += x; if (i >= n) s -= v[i - n]; o.push(i >= n - 1 ? s / n : NaN); }); return o; };
const rsi = (v: number[], n: number) => { const o = [50]; let g = 0, l = 0; for (let i = 1; i < v.length; i++) { const d = v[i] - v[i - 1], u = Math.max(d, 0), w = Math.max(-d, 0); if (i <= n) { g += u / n; l += w / n; } else { g = (g * (n - 1) + u) / n; l = (l * (n - 1) + w) / n; } o.push(l === 0 ? 100 : 100 - 100 / (1 + g / l)); } return o; };
const atr = (b: Bar[], n: number) => { const o: number[] = []; b.forEach((x, i) => { const tr = i ? Math.max(x.h - x.l, Math.abs(x.h - b[i - 1].c), Math.abs(x.l - b[i - 1].c)) : x.h - x.l; o.push(i < n ? (i ? (o[i - 1] * i + tr) / (i + 1) : tr) : (o[i - 1] * (n - 1) + tr) / n); }); return o; };
const er = (v: number[], n: number) => v.map((x, i) => { if (i < n) return NaN; let p = 0; for (let q = i - n + 1; q <= i; q++) p += Math.abs(v[q] - v[q - 1]); return p ? Math.abs(x - v[i - n]) / p : 0; });
const sd = (v: number[], n: number) => v.map((_, i) => { if (i < n - 1) return NaN; const w = v.slice(i - n + 1, i + 1), m = w.reduce((s, x) => s + x, 0) / n; return Math.sqrt(w.reduce((s, x) => s + (x - m) ** 2, 0) / n); });
const pctRank = (v: number[], n: number) => v.map((x, i) => { if (i < n) return NaN; let c = 0; for (let q = i - n; q < i; q++) if (v[q] < x) c++; return c / n; });
const TFS: Record<string, { b: Bar[]; idx: Int32Array }> = { H1: { b: H1.b, idx: CI.c1 }, H4: { b: H4.b, idx: CI.c4 }, D1: { b: D1.b, idx: CI.cD } };
const ind: Record<string, Record<string, number[]>> = {};
for (const [tf, { b }] of Object.entries(TFS)) {
  const c = b.map((x) => x.c), a14 = atr(b, 14), a100 = atr(b, 100), bbw = sd(c, 20).map((s, i) => (4 * s) / c[i]), macd = ema(c, 12).map((x, i) => x - ema(c, 26)[i]);
  const mh = (() => { const m = macd, sg = ema(m, 9); return m.map((x, i) => x - sg[i]); })();
  ind[tf] = { c, a14, volRatio: a14.map((x, i) => x / a100[i]), bbwPct: pctRank(bbw, 120), e20: ema(c, 20), e50: ema(c, 50), e100: ema(c, 100), e200: ema(c, 200), rsi7: rsi(c, 7), rsi14: rsi(c, 14), rsi21: rsi(c, 21), er10: er(c, 10), er20: er(c, 20), mh, adx: tf === "H1" ? I.h1.adx : tf === "H4" ? I.h4.adx : (() => { const o: number[] = [20]; let tr = 0, p = 0, m = 0, ax = 20; for (let i = 1; i < b.length; i++) { const up = b[i].h - b[i - 1].h, dn = b[i - 1].l - b[i].l, t = Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c)); tr = tr - tr / 14 + t; p = p - p / 14 + (up > dn && up > 0 ? up : 0); m = m - m / 14 + (dn > up && dn > 0 ? dn : 0); const pd = (100 * p) / (tr || 1), md = (100 * m) / (tr || 1); ax = (ax * 13 + (100 * Math.abs(pd - md)) / (pd + md || 1)) / 14; o.push(ax); } return o; })() };
}
const base = run({ name: "base" });
// máximas/mínimas semanais (5 dias D1) e pivôs H1
const rows = base.map((t) => {
  const i = t.i0 - 1, d = t.d, p = t.e, f: Record<string, number> = {};
  for (const tf of ["H1", "H4", "D1"]) {
    const k = TFS[tf].idx[i], X = ind[tf]; if (k < 210) continue; const a = X.a14[k];
    for (const n of ["rsi7", "rsi14", "rsi21"]) f[`${n}_${tf}`] = (X[n][k] - 50) * d;
    f[`adx_${tf}`] = X.adx[k]; f[`er10_${tf}`] = X.er10[k]; f[`er20_${tf}`] = X.er20[k]; f[`vol_${tf}`] = X.volRatio[k]; f[`bbwPct_${tf}`] = X.bbwPct[k];
    for (const e of ["e20", "e50", "e100", "e200"]) f[`dist_${e}_${tf}`] = ((p - X[e][k]) / a) * d;
    f[`slope_e50_${tf}`] = ((X.e50[k] - X.e50[k - 5]) / a) * d; f[`macdH_${tf}`] = (X.mh[k] / a) * d; f[`macdHslope_${tf}`] = ((X.mh[k] - X.mh[k - 1]) / a) * d;
    const bb = TFS[tf].b; let run_ = 0; for (let q = k; q > k - 10 && (bb[q].c - bb[q - 1].c) * d > 0; q--) run_++; f[`seqCloses_${tf}`] = run_;
    const w = bb.slice(k - 19, k + 1); f[`donPos20_${tf}`] = d === 1 ? (p - Math.min(...w.map((x) => x.l))) / (Math.max(...w.map((x) => x.h)) - Math.min(...w.map((x) => x.l)) || 1) : (Math.max(...w.map((x) => x.h)) - p) / (Math.max(...w.map((x) => x.h)) - Math.min(...w.map((x) => x.l)) || 1);
  }
  // estrutura H4: topos/fundos ascendentes nos últimos 30 H4 (pivôs de 3)
  const k4 = CI.c4[i], b4 = H4.b; let hh = 0, hl = 0; const piv: { h?: number; l?: number }[] = [];
  for (let q = k4 - 30; q <= k4 - 3; q++) { if (b4[q].h >= Math.max(...b4.slice(q - 3, q + 4).map((x) => x.h))) piv.push({ h: b4[q].h }); if (b4[q].l <= Math.min(...b4.slice(q - 3, q + 4).map((x) => x.l))) piv.push({ l: b4[q].l }); }
  const H = piv.filter((x) => x.h).map((x) => x.h!), L = piv.filter((x) => x.l).map((x) => x.l!);
  for (let q = 1; q < H.length; q++) hh += Math.sign(H[q] - H[q - 1]); for (let q = 1; q < L.length; q++) hl += Math.sign(L[q] - L[q - 1]);
  f.structH4 = (hh + hl) * d;
  // espaço até obstáculos (em R): máxima/mínima de 5 dias, último pivô H1 contra, número redondo de 50 e de 10
  const kd = CI.cD[i], wk = D1.b.slice(kd - 4, kd + 1), wHi = Math.max(...wk.map((x) => x.h)), wLo = Math.min(...wk.map((x) => x.l));
  f.roomWeek = (d === 1 ? wHi - p : p - wLo) / t.risk;
  const r50 = d === 1 ? Math.ceil(p / 50) * 50 - p : p - Math.floor(p / 50) * 50, r10 = d === 1 ? Math.ceil(p / 10) * 10 - p : p - Math.floor(p / 10) * 10;
  f.round50R = r50 / t.risk; f.round10R = r10 / t.risk;
  const kH = CI.c1[i]; let room = 99; for (let q = kH - 2; q > kH - 120; q--) { const bq = H1.b[q]; const isPiv = d === 1 ? bq.h >= Math.max(...H1.b.slice(q - 2, q + 3).map((x) => x.h)) : bq.l <= Math.min(...H1.b.slice(q - 2, q + 3).map((x) => x.l)); if (isPiv && (d === 1 ? bq.h > p : bq.l < p)) { room = Math.abs((d === 1 ? bq.h : bq.l) - p) / t.risk; break; } }
  f.roomPivotH1 = room;
  // consumo do range diário: quanto o dia de hoje já andou (em ATR D1) e posição no dia
  let dHi = -Infinity, dLo = Infinity; for (let q = i; q >= 0 && CI.cD[q] === kd; q--) { dHi = Math.max(dHi, M5[q].h); dLo = Math.min(dLo, M5[q].l); }
  f.dayRangeATR = (dHi - dLo) / ind.D1.a14[kd]; f.dayMoveDir = ((p - (M5[i - Math.min(i, 287)]?.o ?? p)) / ind.D1.a14[kd]) * d;
  f.idadeTendD1 = (() => { let n = 0; for (let q = kd; q > kd - 200 && (D1.b[q].c - ind.D1.e50[q]) * d > 0; q--) n++; return n; })();
  const sb = H1.b[t.k], rg = sb.h - sb.l || 1; f.sigBody = Math.abs(sb.c - sb.o) / rg; f.sigWickAgainst = (d === 1 ? sb.h - Math.max(sb.o, sb.c) : Math.min(sb.o, sb.c) - sb.l) / rg; f.sigRangeATR = rg / I.h1.atr[t.k];
  f.hourNY = (() => { const x = new Date(M5[i].t * 1000); return x.getUTCHours(); })(); f.dow = new Date(M5[i].t * 1000).getUTCDay();
  return { t: t.t, m: t.m, R: t.R, f };
});
fs.writeFileSync("deep_feat.json", JSON.stringify(rows));
console.log("operações", rows.length, "características", Object.keys(rows[0].f).length);
