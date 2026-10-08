// Famílias de hipóteses (definidas ANTES de olhar resultados). Todas causais: só usam candles fechados.
import { M5, M15, H1, H4, D1, closedIndex, ema, sma, atr, rsi, adx, nyHour, type Sig } from "./lib.mts";

const c15 = closedIndex(M15), c1 = closedIndex(H1), c4 = closedIndex(H4), cD = closedIndex(D1);
const cl = (b: { c: number }[]) => b.map((x) => x.c);
export const I = {
  h1: { e20: ema(cl(H1.b), 20), e50: ema(cl(H1.b), 50), atr: atr(H1.b), rsi: rsi(cl(H1.b)), adx: adx(H1.b), sma20: sma(cl(H1.b), 20) },
  h4: { e20: ema(cl(H4.b), 20), e50: ema(cl(H4.b), 50), e200: ema(cl(H4.b), 200), atr: atr(H4.b), rsi: rsi(cl(H4.b)), adx: adx(H4.b) },
  d1: { e20: ema(cl(D1.b), 20), e50: ema(cl(D1.b), 50), atr: atr(D1.b), rsi: rsi(cl(D1.b)) },
  m15: { atr: atr(M15.b), e20: ema(cl(M15.b), 20), rsi: rsi(cl(M15.b)) },
};
// desvio-padrão móvel p/ Bollinger H1
const sd20h1 = (() => { const c = cl(H1.b), o = new Array(c.length).fill(NaN); for (let i = 19; i < c.length; i++) { const w = c.slice(i - 19, i + 1), m = w.reduce((s, v) => s + v, 0) / 20; o[i] = Math.sqrt(w.reduce((s, v) => s + (v - m) ** 2, 0) / 20); } return o; })();
export const CI = { c15, c1, c4, cD };
/** percorre os M5 em que um candle do TF acabou de fechar */
function onClose(ci: Int32Array, fn: (i: number, k: number) => void) { for (let i = 1; i < M5.length - 1; i++) if (ci[i] !== ci[i - 1] && ci[i] > 0) fn(i, ci[i]); }
const h4Trend = (k4: number) => { const e20 = I.h4.e20[k4], e50 = I.h4.e50[k4], c = H4.b[k4].c; return e20 > e50 && c > e50 ? 1 : e20 < e50 && c < e50 ? -1 : 0; };
const d1Trend = (kd: number) => (kd < 50 ? 0 : D1.b[kd].c > I.d1.e50[kd] && I.d1.e20[kd] > I.d1.e50[kd] ? 1 : D1.b[kd].c < I.d1.e50[kd] && I.d1.e20[kd] < I.d1.e50[kd] ? -1 : 0);

// F1 — Pullback de tendência: regime H4, recuo até a EMA20 do H1 com IFR descomprimido, gatilho = H1 rompe a máxima/mínima do recuo
export function F1(p: { rsiTh: number; look: number; tp: number | null; trail: number | null; d1: boolean }): Sig[] {
  const out: Sig[] = [];
  onClose(c1, (i, k) => {
    if (k < 210) return; const k4 = c4[i], kd = cD[i]; if (k4 < 210) return;
    const dir = h4Trend(k4) as 1 | -1 | 0; if (!dir) return; if (p.d1 && d1Trend(kd) !== dir) return;
    const b = H1.b, a = I.h1.atr[k], w = b.slice(k - p.look, k), e20 = I.h1.e20;
    const touched = w.some((x, j) => (dir === 1 ? x.l <= e20[k - p.look + j] : x.h >= e20[k - p.look + j]));
    const rsiMin = Math.min(...I.h1.rsi.slice(k - p.look, k)), rsiMax = Math.max(...I.h1.rsi.slice(k - p.look, k));
    if (!touched || (dir === 1 ? rsiMin > p.rsiTh : rsiMax < 100 - p.rsiTh)) return;
    const brk = dir === 1 ? b[k].c > Math.max(...b.slice(k - 3, k).map((x) => x.h)) && b[k].c > e20[k] : b[k].c < Math.min(...b.slice(k - 3, k).map((x) => x.l)) && b[k].c < e20[k];
    if (!brk) return;
    const ext = dir === 1 ? Math.min(...w.map((x) => x.l), b[k].l) : Math.max(...w.map((x) => x.h), b[k].h), stop = ext - dir * 0.3 * a, risk = Math.abs(b[k].c - stop);
    if (risk < 0.5 * a || risk > 3 * a) return;
    out.push({ i, dir, stop, tp: p.tp ? b[k].c + dir * p.tp * risk : null, maxBars: 12 * 24 * 5, trail: p.trail ? { atrMult: p.trail, atr: a } : null, tag: "F1" });
  });
  return out;
}

// F2 — Rompimento de canal no H4 a favor do D1 (momentum de série temporal), saída por trailing de ATR
export function F2(p: { n: number; stopAtr: number; trail: number; d1: boolean }): Sig[] {
  const out: Sig[] = [];
  onClose(c4, (i, k) => {
    if (k < 210) return; const b = H4.b, a = I.h4.atr[k], kd = cD[i];
    const hi = Math.max(...b.slice(k - p.n, k).map((x) => x.h)), lo = Math.min(...b.slice(k - p.n, k).map((x) => x.l));
    const dir = b[k].c > hi ? 1 : b[k].c < lo ? -1 : 0; if (!dir) return;
    if (p.d1 && d1Trend(kd) !== dir) return;
    out.push({ i, dir: dir as 1 | -1, stop: b[k].c - dir * p.stopAtr * a, tp: null, maxBars: 12 * 24 * 20, trail: { atrMult: p.trail, atr: a }, tag: "F2" });
  });
  return out;
}

// F3 — Captura de liquidez na máxima/mínima do dia anterior (M15) com H4 esticado; alvo em R
export function F3(p: { rsiTh: number; tp: number; nyFrom: number; nyTo: number; minRiskAtr: number }): Sig[] {
  const out: Sig[] = []; let lastDay = -1, usedHi = false, usedLo = false;
  onClose(c15, (i, k) => {
    const kd = cD[i], k4 = c4[i], k1 = c1[i]; if (kd < 60 || k4 < 210 || k1 < 50) return;
    if (kd !== lastDay) { lastDay = kd; usedHi = usedLo = false; }
    const ny = nyHour(M15.b[k].t); if (ny < p.nyFrom || ny >= p.nyTo) return;
    const y = D1.b[kd], b = M15.b[k], a1 = I.h1.atr[k1], r4 = I.h4.rsi[k4];
    if (!usedHi && b.h > y.h && b.c < y.h && r4 >= p.rsiTh) { usedHi = true; const stop = b.h + 0.2 * a1, risk = stop - b.c; if (risk >= p.minRiskAtr * a1 && risk <= 2.5 * a1) out.push({ i, dir: -1, stop, tp: b.c - p.tp * risk, maxBars: 12 * 24, tag: "F3" }); }
    if (!usedLo && b.l < y.l && b.c > y.l && r4 <= 100 - p.rsiTh) { usedLo = true; const stop = b.l - 0.2 * a1, risk = b.c - stop; if (risk >= p.minRiskAtr * a1 && risk <= 2.5 * a1) out.push({ i, dir: 1, stop, tp: b.c + p.tp * risk, maxBars: 12 * 24, tag: "F3" }); }
  });
  return out;
}

// F4 — Reversão à média em lateralidade: H1 com ADX baixo fecha fora da Bollinger e o próximo H1 volta para dentro; alvo = média
export function F4(p: { adxMax: number; k: number; stopAtr: number }): Sig[] {
  const out: Sig[] = [];
  onClose(c1, (i, k) => {
    if (k < 60) return; const b = H1.b, m = I.h1.sma20, s = sd20h1, a = I.h1.atr[k];
    if (I.h1.adx[k] > p.adxMax) return;
    const up0 = m[k - 1] + p.k * s[k - 1], dn0 = m[k - 1] - p.k * s[k - 1], up1 = m[k] + p.k * s[k], dn1 = m[k] - p.k * s[k];
    let dir: 0 | 1 | -1 = 0;
    if (b[k - 1].c > up0 && b[k].c < up1) dir = -1; else if (b[k - 1].c < dn0 && b[k].c > dn1) dir = 1;
    if (!dir) return;
    const ext = dir === -1 ? Math.max(b[k - 1].h, b[k].h) : Math.min(b[k - 1].l, b[k].l), stop = ext + -dir * p.stopAtr * a, tp = m[k];
    if ((tp - b[k].c) * dir <= 0.5 * Math.abs(b[k].c - stop)) return;
    out.push({ i, dir, stop, tp, maxBars: 12 * 24, tag: "F4" });
  });
  return out;
}

// F5 — Rompimento do range asiático em Londres a favor do H4; saída até o fim da manhã de NY
export function F5(p: { tp: number; minRangeAtr: number; maxRangeAtr: number; trend: boolean }): Sig[] {
  const out: Sig[] = []; let day = -1, hi = -Infinity, lo = Infinity, done = false;
  onClose(c15, (i, k) => {
    const b = M15.b[k], ny = nyHour(b.t), kd = cD[i];
    if (kd !== day) { day = kd; hi = -Infinity; lo = Infinity; done = false; }
    if (ny >= 18 || ny < 2) { hi = Math.max(hi, b.h); lo = Math.min(lo, b.l); return; } // Ásia 18h–02h NY
    if (done || ny >= 6 || !Number.isFinite(hi)) return;
    const k1 = c1[i], k4 = c4[i]; if (k1 < 50 || k4 < 210) return; const a = I.h1.atr[k1], rng = hi - lo;
    if (rng < p.minRangeAtr * a || rng > p.maxRangeAtr * a) return;
    const dir = b.c > hi ? 1 : b.c < lo ? -1 : 0; if (!dir) return; done = true;
    if (p.trend && h4Trend(k4) !== dir) return;
    const stop = (hi + lo) / 2, risk = Math.abs(b.c - stop);
    out.push({ i, dir: dir as 1 | -1, stop, tp: b.c + dir * p.tp * risk, maxBars: 12 * 8, tag: "F5" });
  });
  return out;
}

// F2b — mesmo rompimento de canal, mas no H1, com filtro de tendência H4 e/ou D1
export function F2b(p: { n: number; stopAtr: number; trail: number; flt: "d1" | "h4" | "both" }): Sig[] {
  const out: Sig[] = [];
  onClose(c1, (i, k) => {
    if (k < 210) return; const b = H1.b, a = I.h1.atr[k], kd = cD[i], k4 = c4[i]; if (k4 < 210) return;
    const hi = Math.max(...b.slice(k - p.n, k).map((x) => x.h)), lo = Math.min(...b.slice(k - p.n, k).map((x) => x.l));
    const dir = b[k].c > hi ? 1 : b[k].c < lo ? -1 : 0; if (!dir) return;
    if ((p.flt === "d1" || p.flt === "both") && d1Trend(kd) !== dir) return;
    if ((p.flt === "h4" || p.flt === "both") && h4Trend(k4) !== dir) return;
    out.push({ i, dir: dir as 1 | -1, stop: b[k].c - dir * p.stopAtr * a, tp: null, maxBars: 12 * 24 * 10, trail: { atrMult: p.trail, atr: a }, tag: "F2b" });
  });
  return out;
}
// F1b — recuo até a EMA20 do M15 dentro da tendência H1+H4 (+D1 opcional), gatilho = M15 rompe a máxima/mínima das 3 anteriores
export function F1b(p: { rsiTh: number; look: number; trail: number; d1: boolean }): Sig[] {
  const out: Sig[] = [];
  const h1Trend = (k1: number) => (I.h1.e20[k1] > I.h1.e50[k1] && H1.b[k1].c > I.h1.e50[k1] ? 1 : I.h1.e20[k1] < I.h1.e50[k1] && H1.b[k1].c < I.h1.e50[k1] ? -1 : 0);
  onClose(c15, (i, k) => {
    if (k < 210) return; const k1 = c1[i], k4 = c4[i], kd = cD[i]; if (k4 < 210 || k1 < 60) return;
    const dir = h4Trend(k4); if (!dir || h1Trend(k1) !== dir) return; if (p.d1 && d1Trend(kd) !== dir) return;
    const b = M15.b, e20 = I.m15.e20, a = I.h1.atr[k1], w = b.slice(k - p.look, k);
    const touched = w.some((x, j) => (dir === 1 ? x.l <= e20[k - p.look + j] : x.h >= e20[k - p.look + j]));
    const r = I.m15.rsi.slice(k - p.look, k); if (!touched || (dir === 1 ? Math.min(...r) > p.rsiTh : Math.max(...r) < 100 - p.rsiTh)) return;
    const brk = dir === 1 ? b[k].c > Math.max(...b.slice(k - 3, k).map((x) => x.h)) : b[k].c < Math.min(...b.slice(k - 3, k).map((x) => x.l)); if (!brk) return;
    const ext = dir === 1 ? Math.min(...w.map((x) => x.l), b[k].l) : Math.max(...w.map((x) => x.h), b[k].h), stop = ext - dir * 0.2 * a, risk = Math.abs(b[k].c - stop);
    if (risk < 0.4 * a || risk > 2 * a) return;
    out.push({ i, dir: dir as 1 | -1, stop, tp: null, maxBars: 12 * 24 * 3, trail: { atrMult: p.trail, atr: a }, tag: "F1b" });
  });
  return out;
}
