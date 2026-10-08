// AURUM_TREND_V1 — motor de tendência (pesquisa ALPHA_2, 2026-10-08). Independente do FINAL_V1.
// Validado no HistData 2018-01 → 2026-09 (escolha 2018–22, validação 2023–24, teste 2025–26), custo 0,5–2 pt.
// Dois módulos:
//   A · ROMPIMENTO_H1 — H1 fecha além da máxima/mínima das 24 horas anteriores, a favor da tendência H4 e D1,
//       sem perseguir (H4 a no máximo 2,5 ATR da EMA50). Stop 2,5×ATR(H1), parcial de 33% em 2R + stop no 0,
//       resto no trailing de 6×ATR(H1). Até 10 dias.
//   B · ROMPIMENTO_H4 — H4 fecha além do canal das 60 velas anteriores, a favor da tendência D1.
//       Stop 2,5×ATR(H4), trailing 4×ATR(H4). Até 20 dias.
// Somente candles FECHADOS. Execução manual. Nenhuma ordem é enviada.

export type Candle = { time: number; open: number; high: number; low: number; close: number }; // time = abertura, em segundos UTC
export type TrendModule = "ROMPIMENTO_H1" | "ROMPIMENTO_H4";
export type TrendTrade = {
  module: TrendModule; side: "LONG" | "SHORT"; signalTime: number; entryTime: number; entry: number; stop: number; risk: number;
  currentStop: number; partialTaken: boolean; target2R: number; status: "ABERTA" | "ENCERRADA";
  exitTime?: number; exit?: number; exitReason?: "stop" | "trailing" | "tempo"; resultR?: number; bestR: number;
};
export type TrendState = {
  version: "AURUM_TREND_V1";
  lastClosedH1: number;
  trendH4: -1 | 0 | 1; trendD1: -1 | 0 | 1; extH4: number;
  levels: { h1High24: number; h1Low24: number; h4High60: number; h4Low60: number; atrH1: number; atrH4: number };
  ready: { A: string; B: string };
};

const nyOffset = (t: number) => {
  const d = new Date(t * 1000), y = d.getUTCFullYear();
  const mar = new Date(Date.UTC(y, 2, 1)), s = Date.UTC(y, 2, 1 + ((7 - mar.getUTCDay()) % 7) + 7, 7) / 1000;
  const nov = new Date(Date.UTC(y, 10, 1)), e = Date.UTC(y, 10, 1 + ((7 - nov.getUTCDay()) % 7), 6) / 1000;
  return t >= s && t < e ? -4 : -5;
};
const keyH4 = (t: number) => Math.floor((t + 3600) / 14400);
const keyD1 = (t: number) => Math.floor((t + nyOffset(t) * 3600 + 7 * 3600) / 86400); // dia vira às 17h de NY

type Agg = { b: Candle[]; lastH1: number[] };
function aggregate(h1: Candle[], key: (t: number) => number): Agg {
  const b: Candle[] = [], lastH1: number[] = []; let k = NaN;
  h1.forEach((x, i) => {
    const kk = key(x.time);
    if (kk !== k) { b.push({ ...x }); lastH1.push(i); k = kk; }
    else { const c = b[b.length - 1]; c.high = Math.max(c.high, x.high); c.low = Math.min(c.low, x.low); c.close = x.close; lastH1[lastH1.length - 1] = i; }
  });
  return { b, lastH1 };
}
const ema = (v: number[], n: number) => { const k = 2 / (n + 1), o: number[] = []; v.forEach((x, i) => o.push(i ? x * k + o[i - 1] * (1 - k) : x)); return o; };
const atr = (b: Candle[], n = 14) => {
  const o: number[] = [];
  b.forEach((x, i) => {
    const tr = i ? Math.max(x.high - x.low, Math.abs(x.high - b[i - 1].close), Math.abs(x.low - b[i - 1].close)) : x.high - x.low;
    o.push(i < n ? (i ? (o[i - 1] * i + tr) / (i + 1) : tr) : (o[i - 1] * (n - 1) + tr) / n);
  });
  return o;
};
/** para cada H1 k: índice do último candle do TF maior já fechado quando o H1 k fecha */
const closedMap = (agg: Agg, n: number) => { const out = new Int32Array(n).fill(-1); let j = -1; for (let k = 0; k < n; k++) { while (j + 1 < agg.lastH1.length && agg.lastH1[j + 1] <= k) j++; out[k] = j; } return out; };

export const TREND_RULES = {
  A: { donchian: 24, stopAtr: 2.5, trailAtr: 6, maxExtH4: 2.5, partial: { frac: 0.33, R: 2 }, maxHours: 240 },
  B: { donchian: 60, stopAtr: 2.5, trailAtr: 4, maxHours: 480 },
} as const;

/** Roda o motor sobre H1 FECHADOS (ordem crescente). Recalcula sinais e gestão de forma determinística. */
export function runTrendEngine(h1In: Candle[]) {
  const h1 = h1In.filter((c) => [c.open, c.high, c.low, c.close].every(Number.isFinite)).sort((a, b) => a.time - b.time);
  const n = h1.length;
  const H4 = aggregate(h1, keyH4), D1 = aggregate(h1, keyD1);
  const c4 = closedMap(H4, n), cD = closedMap(D1, n);
  const aH1 = atr(h1), aH4 = atr(H4.b), aD1 = atr(D1.b);
  const e20h4 = ema(H4.b.map((x) => x.close), 20), e50h4 = ema(H4.b.map((x) => x.close), 50);
  const e20d1 = ema(D1.b.map((x) => x.close), 20), e50d1 = ema(D1.b.map((x) => x.close), 50);
  void aD1;
  const trendH4 = (j: number): -1 | 0 | 1 => (j < 50 ? 0 : e20h4[j] > e50h4[j] && H4.b[j].close > e50h4[j] ? 1 : e20h4[j] < e50h4[j] && H4.b[j].close < e50h4[j] ? -1 : 0);
  const trendD1 = (j: number): -1 | 0 | 1 => (j < 50 ? 0 : D1.b[j].close > e50d1[j] && e20d1[j] > e50d1[j] ? 1 : D1.b[j].close < e50d1[j] && e20d1[j] < e50d1[j] ? -1 : 0);
  const extH4 = (j: number, dir: number) => ((H4.b[j].close - e50h4[j]) / (aH4[j] || 1)) * dir;

  type Sig = { module: TrendModule; k: number; dir: 1 | -1; stopDist: number; trail: number; partial: { frac: number; R: number } | null; maxHours: number };
  const sigs: Sig[] = [];
  for (let k = 210; k < n; k++) {
    const j4 = c4[k], jd = cD[k];
    if (j4 < 60 || jd < 50) continue;
    // A — rompimento do H1
    const hi = Math.max(...h1.slice(k - TREND_RULES.A.donchian, k).map((x) => x.high)), lo = Math.min(...h1.slice(k - TREND_RULES.A.donchian, k).map((x) => x.low));
    const dA = h1[k].close > hi ? 1 : h1[k].close < lo ? -1 : 0;
    if (dA && trendH4(j4) === dA && trendD1(jd) === dA && extH4(j4, dA) <= TREND_RULES.A.maxExtH4)
      sigs.push({ module: "ROMPIMENTO_H1", k, dir: dA as 1 | -1, stopDist: TREND_RULES.A.stopAtr * aH1[k], trail: TREND_RULES.A.trailAtr * aH1[k], partial: TREND_RULES.A.partial, maxHours: TREND_RULES.A.maxHours });
    // B — rompimento do H4 (só quando um H4 acabou de fechar neste H1)
    if (j4 >= 0 && H4.lastH1[j4] === k && j4 > TREND_RULES.B.donchian) {
      const w = H4.b.slice(j4 - TREND_RULES.B.donchian, j4), hb = Math.max(...w.map((x) => x.high)), lb = Math.min(...w.map((x) => x.low));
      const dB = H4.b[j4].close > hb ? 1 : H4.b[j4].close < lb ? -1 : 0;
      if (dB && trendD1(jd) === dB) sigs.push({ module: "ROMPIMENTO_H4", k, dir: dB as 1 | -1, stopDist: TREND_RULES.B.stopAtr * aH4[j4], trail: TREND_RULES.B.trailAtr * aH4[j4], partial: null, maxHours: TREND_RULES.B.maxHours });
    }
  }

  // gestão: entrada na abertura do H1 seguinte; stop primeiro no mesmo candle; uma posição por módulo
  const trades: TrendTrade[] = [];
  const busy: Record<TrendModule, number> = { ROMPIMENTO_H1: -1, ROMPIMENTO_H4: -1 };
  for (const s of sigs) {
    if (s.k <= busy[s.module]) continue;
    if (s.k + 1 >= n) { // sinal no último H1 fechado: entrada é agora (próxima abertura)
      const entry = h1[s.k].close, stop = entry - s.dir * s.stopDist;
      trades.push({ module: s.module, side: s.dir === 1 ? "LONG" : "SHORT", signalTime: h1[s.k].time + 3600, entryTime: h1[s.k].time + 3600, entry, stop, risk: s.stopDist, currentStop: stop, partialTaken: false, target2R: entry + s.dir * 2 * s.stopDist, status: "ABERTA", bestR: 0 });
      busy[s.module] = n; continue;
    }
    const entry = h1[s.k + 1].open, stop0 = entry - s.dir * s.stopDist, risk = s.stopDist;
    let stop = stop0, best = entry, partial = false, banked = 0, j = s.k + 1, done = false;
    const t: TrendTrade = { module: s.module, side: s.dir === 1 ? "LONG" : "SHORT", signalTime: h1[s.k].time + 3600, entryTime: h1[s.k + 1].time, entry, stop: stop0, risk, currentStop: stop0, partialTaken: false, target2R: entry + s.dir * 2 * risk, status: "ABERTA", bestR: 0 };
    for (; j < n && j <= s.k + s.maxHours; j++) {
      const b = h1[j];
      if (s.dir === 1 ? b.low <= stop : b.high >= stop) {
        const r = ((stop - entry) * s.dir) / risk;
        Object.assign(t, { status: "ENCERRADA", exitTime: b.time, exit: stop, exitReason: stop === stop0 ? "stop" : "trailing", resultR: partial ? banked + (1 - s.partial!.frac) * r : r });
        done = true; break;
      }
      best = s.dir === 1 ? Math.max(best, b.high) : Math.min(best, b.low);
      if (s.partial && !partial && ((best - entry) * s.dir) / risk >= s.partial.R) { partial = true; banked = s.partial.frac * s.partial.R; stop = s.dir === 1 ? Math.max(stop, entry) : Math.min(stop, entry); }
      const ts = best - s.dir * s.trail; stop = s.dir === 1 ? Math.max(stop, ts) : Math.min(stop, ts);
    }
    t.bestR = ((best - entry) * s.dir) / risk; t.currentStop = stop; t.partialTaken = partial;
    if (!done && j > s.k + s.maxHours && j - 1 < n) {
      const last = h1[Math.min(j - 1, n - 1)], r = ((last.close - entry) * s.dir) / risk;
      Object.assign(t, { status: "ENCERRADA", exitTime: last.time + 3600, exit: last.close, exitReason: "tempo", resultR: partial ? banked + (1 - s.partial!.frac) * r : r });
    }
    trades.push(t);
    busy[s.module] = t.status === "ABERTA" ? n : j;
  }

  // estado atual para o painel
  const k = n - 1, j4 = n ? c4[k] : -1, jd = n ? cD[k] : -1;
  const tH4 = j4 >= 0 ? trendH4(j4) : 0, tD1 = jd >= 0 ? trendD1(jd) : 0;
  const lv = n > 30 && j4 > 60 ? {
    h1High24: Math.max(...h1.slice(k - 23, k + 1).map((x) => x.high)), h1Low24: Math.min(...h1.slice(k - 23, k + 1).map((x) => x.low)),
    h4High60: Math.max(...H4.b.slice(j4 - 59, j4 + 1).map((x) => x.high)), h4Low60: Math.min(...H4.b.slice(j4 - 59, j4 + 1).map((x) => x.low)),
    atrH1: aH1[k], atrH4: aH4[j4],
  } : { h1High24: NaN, h1Low24: NaN, h4High60: NaN, h4Low60: NaN, atrH1: NaN, atrH4: NaN };
  const ext = j4 >= 0 && tH4 ? extH4(j4, tH4) : 0;
  const ready = {
    A: !tH4 || tH4 !== tD1 ? "Aguardar: H4 e D1 precisam apontar a mesma direção" : ext > TREND_RULES.A.maxExtH4 ? `Aguardar: preço esticado (${ext.toFixed(1)} ATR da EMA50 do H4)` : `Pronto para ${tH4 === 1 ? "COMPRA acima de " + lv.h1High24.toFixed(2) : "VENDA abaixo de " + lv.h1Low24.toFixed(2)} (fechamento do H1)`,
    B: !tD1 ? "Aguardar: D1 sem tendência definida" : `Pronto para ${tD1 === 1 ? "COMPRA acima de " + lv.h4High60.toFixed(2) : "VENDA abaixo de " + lv.h4Low60.toFixed(2)} (fechamento do H4)`,
  };
  const state: TrendState = { version: "AURUM_TREND_V1", lastClosedH1: n ? h1[k].time : 0, trendH4: tH4, trendD1: tD1, extH4: ext, levels: lv, ready };
  return { state, trades };
}

export function trendStats(trades: TrendTrade[]) {
  const done = trades.filter((t) => t.status === "ENCERRADA" && Number.isFinite(t.resultR));
  const R = done.map((t) => t.resultR!), sum = R.reduce((s, v) => s + v, 0);
  const gw = R.filter((v) => v > 0).reduce((s, v) => s + v, 0), gl = -R.filter((v) => v <= 0).reduce((s, v) => s + v, 0);
  let eq = 0, pk = 0, dd = 0; for (const v of R) { eq += v; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  return { trades: done.length, totalR: sum, avgR: done.length ? sum / done.length : 0, winRate: done.length ? R.filter((v) => v > 0).length / done.length : 0, profitFactor: gl ? gw / gl : gw > 0 ? 99 : 0, maxDrawdownR: dd };
}
