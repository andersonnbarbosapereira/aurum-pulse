// AURUM_TREND_V2 — carteira de setups a favor da tendência (pesquisa 2026-10-08). Independente do FINAL_V1.
// Busca combinatória (15 gatilhos × 6 contextos × 4 sessões × 2 stops × 7 saídas = 4.410 combinações) no HistData
// 2018-01 → 2026-09. Escolha SÓ com 2018–22; 2023–24 confirmou; 2025–26 = teste. Custo 0,5 pt; reconferido no caminho M5.
// Todos os setups: sinal no fechamento do H1, entrada na abertura do H1 seguinte, stop em k×ATR(H1) e saída por
// stop móvel de 6×ATR(H1) a partir do melhor preço (até 10 dias). Uma posição por setup. Execução manual.

export type Candle = { time: number; open: number; high: number; low: number; close: number }; // time = abertura (s, UTC)
export type TrendModule = "VELA_FORCA" | "RECUO_EMA20" | "CANAL_12H" | "ROMPIMENTO_H1" | "ROMPIMENTO_H4" | "ENGOLFO_EMA" | "ROMPE_DIA_ANT" | "INSIDE_BAR";
export type TrendTrade = {
  module: TrendModule; side: "LONG" | "SHORT"; signalTime: number; entryTime: number; entry: number; stop: number; risk: number;
  currentStop: number; status: "ABERTA" | "ENCERRADA"; exitTime?: number; exit?: number; exitReason?: "stop" | "trailing" | "tempo"; resultR?: number; bestR: number;
};

type Ctx = "D1" | "H4+D1" | "H4+D1+naoEsticado";
type Ses = "todas" | "Londres+NY" | "NY";
export const TREND_SETUPS: Record<TrendModule, { label: string; ctx: Ctx; ses: Ses; stopAtr: number; active: boolean; desc: string }> = {
  VELA_FORCA: { label: "Vela de força", ctx: "D1", ses: "Londres+NY", stopAtr: 1.5, active: true, desc: "H1 com corpo > 1,8× a mediana das 20 anteriores, fechando no quarto final, a favor do D1" },
  RECUO_EMA20: { label: "Recuo na EMA20", ctx: "H4+D1", ses: "Londres+NY", stopAtr: 1.5, active: true, desc: "tocou a EMA20 do H1 nas 6 velas anteriores e fechou rompendo as 3 últimas, a favor do H4 e do D1" },
  CANAL_12H: { label: "Canal 12h", ctx: "D1", ses: "todas", stopAtr: 1.5, active: false, desc: "H1 fecha além da máxima/mínima das 12 horas anteriores, a favor do D1 (desligado na gestão de risco: piora a queda máxima)" },
  ROMPIMENTO_H1: { label: "Rompimento 24h", ctx: "H4+D1+naoEsticado", ses: "todas", stopAtr: 2.5, active: true, desc: "H1 fecha além das 24 horas anteriores, H4 e D1 a favor, H4 a no máximo 2,5 ATR da EMA50" },
  ROMPIMENTO_H4: { label: "Rompimento H4", ctx: "D1", ses: "todas", stopAtr: 2.5, active: true, desc: "H4 fecha além do canal das 60 velas H4 anteriores, a favor do D1" },
  ENGOLFO_EMA: { label: "Engolfo na EMA20", ctx: "H4+D1", ses: "Londres+NY", stopAtr: 1.5, active: false, desc: "engolfo tocando a EMA20 do H1 (extra, desligado)" },
  ROMPE_DIA_ANT: { label: "Rompe dia anterior", ctx: "H4+D1+naoEsticado", ses: "NY", stopAtr: 2.5, active: false, desc: "H1 fecha além da máx/mín do dia anterior (extra, desligado)" },
  INSIDE_BAR: { label: "Inside bar", ctx: "D1", ses: "Londres+NY", stopAtr: 2.5, active: false, desc: "rompimento da vela-mãe (extra, desligado)" },
};
const TRAIL_ATR = 6, MAX_HOURS = 240;
/** Gestão de risco (estudo de banca 2026-10-08): stop acima de 0,7% do preço rendeu negativo no treino (≈ US$ 29 com 0,01 lote a 4.100);
 *  no máximo 3 posições abertas ao mesmo tempo (a pior queda cai de ~67R para ~41R). */
export const RISK_RULES = { maxStopPct: 0.7, maxOpen: 3 } as const;

const nyOffset = (t: number) => {
  const d = new Date(t * 1000), y = d.getUTCFullYear();
  const mar = new Date(Date.UTC(y, 2, 1)), s = Date.UTC(y, 2, 1 + ((7 - mar.getUTCDay()) % 7) + 7, 7) / 1000;
  const nov = new Date(Date.UTC(y, 10, 1)), e = Date.UTC(y, 10, 1 + ((7 - nov.getUTCDay()) % 7), 6) / 1000;
  return t >= s && t < e ? -4 : -5;
};
const nyHour = (t: number) => { const h = new Date((t + nyOffset(t) * 3600) * 1000); return h.getUTCHours() + h.getUTCMinutes() / 60; };
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
const closedMap = (agg: Agg, n: number) => { const out = new Int32Array(n).fill(-1); let j = -1; for (let k = 0; k < n; k++) { while (j + 1 < agg.lastH1.length && agg.lastH1[j + 1] <= k) j++; out[k] = j; } return out; };

export type TrendState = {
  version: "AURUM_TREND_V2"; lastClosedH1: number; trendH4: -1 | 0 | 1; trendD1: -1 | 0 | 1; extH4: number; atrH1: number;
  watch: { module: TrendModule; label: string; text: string }[];
};

/** Roda a carteira sobre H1 FECHADOS (ordem crescente). Recalcula sinais e gestão de forma determinística. */
export function runTrendEngine(h1In: Candle[], opts: { includeInactive?: boolean; noRiskRules?: boolean } = {}) {
  const b = h1In.filter((c) => [c.open, c.high, c.low, c.close].every(Number.isFinite)).sort((x, y) => x.time - y.time);
  const n = b.length;
  const H4 = aggregate(b, keyH4), D1 = aggregate(b, keyD1), c4 = closedMap(H4, n), cD = closedMap(D1, n);
  const A = atr(b), e20 = ema(b.map((x) => x.close), 20), aH4 = atr(H4.b);
  const e20h4 = ema(H4.b.map((x) => x.close), 20), e50h4 = ema(H4.b.map((x) => x.close), 50);
  const e20d1 = ema(D1.b.map((x) => x.close), 20), e50d1 = ema(D1.b.map((x) => x.close), 50);
  const tr4 = (k: number) => { const j = c4[k]; if (j < 60) return 0; return e20h4[j] > e50h4[j] && H4.b[j].close > e50h4[j] ? 1 : e20h4[j] < e50h4[j] && H4.b[j].close < e50h4[j] ? -1 : 0; };
  const trD = (k: number) => { const j = cD[k]; if (j < 60) return 0; return D1.b[j].close > e50d1[j] && e20d1[j] > e50d1[j] ? 1 : D1.b[j].close < e50d1[j] && e20d1[j] < e50d1[j] ? -1 : 0; };
  const ext4 = (k: number, d: number) => { const j = c4[k]; return ((H4.b[j].close - e50h4[j]) / (aH4[j] || 1)) * d; };
  const ctxOk = (c: Ctx, k: number, d: number) => (c === "D1" ? trD(k) === d : c === "H4+D1" ? tr4(k) === d && trD(k) === d : tr4(k) === d && trD(k) === d && ext4(k, d) <= 2.5);
  const sesOk = (s: Ses, k: number) => { if (s === "todas") return true; const h = nyHour(b[k].time + 3600); return s === "NY" ? h >= 8 && h < 16 : h >= 2 && h < 16; };
  const hiN = (k: number, m: number) => { let v = -Infinity; for (let q = k - m; q < k; q++) v = Math.max(v, b[q].high); return v; };
  const loN = (k: number, m: number) => { let v = Infinity; for (let q = k - m; q < k; q++) v = Math.min(v, b[q].low); return v; };
  const medBody = (k: number) => { const v: number[] = []; for (let q = k - 20; q < k; q++) v.push(Math.abs(b[q].close - b[q].open)); v.sort((x, y) => x - y); return v[10]; };

  // gatilhos brutos no fechamento do H1 k
  const raw = (k: number): [TrendModule, 1 | -1][] => {
    const out: [TrendModule, 1 | -1][] = [], x = b[k], p = b[k - 1];
    const body = x.close - x.open, rg = x.high - x.low || 1;
    if (Math.abs(body) > 1.8 * medBody(k) && (body > 0 ? (x.close - x.low) / rg > 0.75 : (x.high - x.close) / rg > 0.75)) out.push(["VELA_FORCA", body > 0 ? 1 : -1]);
    for (const d of [1, -1] as const) {
      let touched = false; for (let q = k - 6; q < k; q++) if (d === 1 ? b[q].low <= e20[q] : b[q].high >= e20[q]) touched = true;
      if (touched && (d === 1 ? x.close > Math.max(b[k - 1].high, b[k - 2].high, b[k - 3].high) && x.close > e20[k] : x.close < Math.min(b[k - 1].low, b[k - 2].low, b[k - 3].low) && x.close < e20[k])) out.push(["RECUO_EMA20", d]);
    }
    if (x.close > hiN(k, 12)) out.push(["CANAL_12H", 1]); else if (x.close < loN(k, 12)) out.push(["CANAL_12H", -1]);
    if (x.close > hiN(k, 24)) out.push(["ROMPIMENTO_H1", 1]); else if (x.close < loN(k, 24)) out.push(["ROMPIMENTO_H1", -1]);
    const j = c4[k];
    if (j > 70 && j !== c4[k - 1]) { let hi = -Infinity, lo = Infinity; for (let q = j - 60; q < j; q++) { hi = Math.max(hi, H4.b[q].high); lo = Math.min(lo, H4.b[q].low); } if (H4.b[j].close > hi) out.push(["ROMPIMENTO_H4", 1]); else if (H4.b[j].close < lo) out.push(["ROMPIMENTO_H4", -1]); }
    if (x.low <= e20[k] && x.high >= e20[k]) { if (x.close > x.open && p.close < p.open && x.close >= p.open && x.open <= p.close) out.push(["ENGOLFO_EMA", 1]); if (x.close < x.open && p.close > p.open && x.close <= p.open && x.open >= p.close) out.push(["ENGOLFO_EMA", -1]); }
    const jd = cD[k]; if (jd > 0) { const y = D1.b[jd]; if (x.close > y.high && p.close <= y.high) out.push(["ROMPE_DIA_ANT", 1]); if (x.close < y.low && p.close >= y.low) out.push(["ROMPE_DIA_ANT", -1]); }
    const m = b[k - 2]; if (p.high <= m.high && p.low >= m.low) { if (x.close > m.high) out.push(["INSIDE_BAR", 1]); else if (x.close < m.low) out.push(["INSIDE_BAR", -1]); }
    return out;
  };

  const trades: TrendTrade[] = [];
  const busy: Partial<Record<TrendModule, number>> = {};
  for (let k = 230; k < n; k++) {
    if (!(A[k] > 0)) continue;
    for (const [mod, d] of raw(k)) {
      const S = TREND_SETUPS[mod];
      if ((!S.active && !opts.includeInactive) || k <= (busy[mod] ?? -1) || !ctxOk(S.ctx, k, d) || !sesOk(S.ses, k)) continue;
      const risk = S.stopAtr * A[k], side = d === 1 ? "LONG" : "SHORT";
      if (!opts.noRiskRules) {
        if ((risk / b[k].close) * 100 > RISK_RULES.maxStopPct) continue;
        const openNow = trades.filter((t) => t.entryTime <= b[k].time + 3600 && (t.status === "ABERTA" || (t.exitTime ?? 0) > b[k].time + 3600)).length;
        if (openNow >= RISK_RULES.maxOpen) continue;
      }
      if (k + 1 >= n) { // sinal no último H1 fechado: entrada agora
        const e = b[k].close;
        trades.push({ module: mod, side, signalTime: b[k].time + 3600, entryTime: b[k].time + 3600, entry: e, stop: e - d * risk, risk, currentStop: e - d * risk, status: "ABERTA", bestR: 0 });
        busy[mod] = n; continue;
      }
      const e = b[k + 1].open, stop0 = e - d * risk; let stop = stop0, best = e, q = k + 1, done = false;
      const t: TrendTrade = { module: mod, side, signalTime: b[k].time + 3600, entryTime: b[k + 1].time, entry: e, stop: stop0, risk, currentStop: stop0, status: "ABERTA", bestR: 0 };
      for (; q < n && q <= k + MAX_HOURS; q++) {
        const x = b[q];
        if (d === 1 ? x.low <= stop : x.high >= stop) { Object.assign(t, { status: "ENCERRADA", exitTime: x.time, exit: stop, exitReason: stop === stop0 ? "stop" : "trailing", resultR: ((stop - e) * d) / risk }); done = true; break; }
        best = d === 1 ? Math.max(best, x.high) : Math.min(best, x.low);
        const ts = best - d * TRAIL_ATR * A[k]; stop = d === 1 ? Math.max(stop, ts) : Math.min(stop, ts);
      }
      t.bestR = ((best - e) * d) / risk; t.currentStop = stop;
      if (!done && q > k + MAX_HOURS) { const last = b[Math.min(q, n - 1)]; Object.assign(t, { status: "ENCERRADA", exitTime: last.time + 3600, exit: last.close, exitReason: "tempo", resultR: ((last.close - e) * d) / risk }); }
      trades.push(t);
      busy[mod] = t.status === "ABERTA" ? n : q;
    }
  }

  // estado atual
  const k = n - 1, tH4 = n ? (tr4(k) as -1 | 0 | 1) : 0, tD1 = n ? (trD(k) as -1 | 0 | 1) : 0;
  const lado = (d: number) => (d === 1 ? "COMPRA" : "VENDA");
  const watch: TrendState["watch"] = [];
  if (n > 240) {
    const d = tD1;
    if (!d) watch.push({ module: "CANAL_12H", label: "Todos", text: "D1 sem tendência definida: setups aguardando" });
    else {
      watch.push({ module: "CANAL_12H", label: TREND_SETUPS.CANAL_12H.label, text: `${lado(d)} se um H1 fechar ${d === 1 ? "acima de " + hiN(k + 1, 12).toFixed(2) : "abaixo de " + loN(k + 1, 12).toFixed(2)}` });
      watch.push({ module: "VELA_FORCA", label: TREND_SETUPS.VELA_FORCA.label, text: `${lado(d)} numa vela H1 forte (corpo > ${(1.8 * medBody(k + 1)).toFixed(1)} pts) em Londres/NY` });
      const ok4 = tH4 === d;
      watch.push({ module: "RECUO_EMA20", label: TREND_SETUPS.RECUO_EMA20.label, text: ok4 ? `${lado(d)} após recuo até a EMA20 do H1 (${e20[k].toFixed(2)}) e retomada` : "aguardando H4 alinhar com o D1" });
      watch.push({ module: "ROMPIMENTO_H1", label: TREND_SETUPS.ROMPIMENTO_H1.label, text: !ok4 ? "aguardando H4 alinhar com o D1" : ext4(k, d) > 2.5 ? `preço esticado (${ext4(k, d).toFixed(1)} ATR da EMA50 H4)` : `${lado(d)} se um H1 fechar ${d === 1 ? "acima de " + hiN(k + 1, 24).toFixed(2) : "abaixo de " + loN(k + 1, 24).toFixed(2)}` });
      const j = c4[k]; if (j > 70) { let hi = -Infinity, lo = Infinity; for (let q = j - 59; q <= j; q++) { hi = Math.max(hi, H4.b[q].high); lo = Math.min(lo, H4.b[q].low); } watch.push({ module: "ROMPIMENTO_H4", label: TREND_SETUPS.ROMPIMENTO_H4.label, text: `${lado(d)} se um H4 fechar ${d === 1 ? "acima de " + hi.toFixed(2) : "abaixo de " + lo.toFixed(2)}` }); }
    }
  }
  const state: TrendState = { version: "AURUM_TREND_V2", lastClosedH1: n ? b[k].time : 0, trendH4: tH4, trendD1: tD1, extH4: n && tH4 ? ext4(k, tH4) : 0, atrH1: n ? A[k] : NaN, watch };
  return { state, trades: trades.sort((x, y) => x.entryTime - y.entryTime) };
}

export function trendStats(trades: TrendTrade[]) {
  const done = trades.filter((t) => t.status === "ENCERRADA" && Number.isFinite(t.resultR));
  const R = done.map((t) => t.resultR!), sum = R.reduce((s, v) => s + v, 0);
  const usd = done.reduce((s, t) => s + t.resultR! * t.risk, 0); // lote 0,01 no XAUUSD = US$ 1 por ponto
  const gw = R.filter((v) => v > 0).reduce((s, v) => s + v, 0), gl = -R.filter((v) => v <= 0).reduce((s, v) => s + v, 0);
  let eq = 0, pk = 0, dd = 0; for (const v of R) { eq += v; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  return { trades: done.length, totalR: sum, avgR: done.length ? sum / done.length : 0, winRate: done.length ? R.filter((v) => v > 0).length / done.length : 0, profitFactor: gl ? gw / gl : gw > 0 ? 99 : 0, maxDrawdownR: dd, usd001: usd };
}
