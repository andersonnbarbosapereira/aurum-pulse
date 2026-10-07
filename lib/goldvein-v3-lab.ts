
type Raw = any;

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  spread: number;
};

type Trade = {
  entryTime: number;
  exitTime: number;
  entry: number;
  exit: number;
  stop: number;
  target: number;
  riskBudget: number;
  pnl: number;
  r: number;
  reason: string;
};

function mid(v: any): number {
  const bid = Number(v?.bid);
  const ask = Number(v?.ask ?? v?.offer);
  if (Number.isFinite(bid) && Number.isFinite(ask)) return (bid + ask) / 2;
  if (Number.isFinite(bid)) return bid;
  if (Number.isFinite(ask)) return ask;
  return NaN;
}

function spreadOf(v: any): number {
  const bid = Number(v?.bid);
  const ask = Number(v?.ask ?? v?.offer);
  return Number.isFinite(bid) && Number.isFinite(ask) && ask >= bid ? ask - bid : NaN;
}

function normalize(r: Raw): Candle | null {
  const rawTime = String(r?.snapshotTimeUTC ?? r?.snapshotTime ?? r?.time ?? "");
  const time = Date.parse(rawTime.endsWith("Z") ? rawTime : rawTime + "Z");
  const open = mid(r?.openPrice);
  const high = mid(r?.highPrice);
  const low = mid(r?.lowPrice);
  const close = mid(r?.closePrice);
  const volume = Number(r?.lastTradedVolume ?? r?.volume ?? 0);
  const observedSpreads = [
    spreadOf(r?.openPrice),
    spreadOf(r?.closePrice),
    spreadOf(r?.highPrice),
    spreadOf(r?.lowPrice),
  ].filter(Number.isFinite);
  const spread = observedSpreads.length
    ? observedSpreads.reduce((s, x) => s + x, 0) / observedSpreads.length
    : 0.04;
  if (![time, open, high, low, close].every(Number.isFinite)) return null;
  return {
    time,
    open,
    high,
    low,
    close,
    volume: Number.isFinite(volume) ? Math.max(1, volume) : 1,
    spread,
  };
}

function prepare(raw: Raw[]): Candle[] {
  return raw
    .map(normalize)
    .filter((x): x is Candle => !!x)
    .sort((a, b) => a.time - b.time);
}

function lastSunday(year: number, month: number): number {
  const d = new Date(Date.UTC(year, month + 1, 0));
  return d.getUTCDate() - d.getUTCDay();
}

function brokerLocal(t: number) {
  const d0 = new Date(t);
  const y = d0.getUTCFullYear();
  // EET/EEST: DST changes at 01:00 UTC on last Sunday of Mar/Oct.
  const dstStart = Date.UTC(y, 2, lastSunday(y, 2), 1);
  const dstEnd = Date.UTC(y, 9, lastSunday(y, 9), 1);
  const offsetHours = t >= dstStart && t < dstEnd ? 3 : 2;
  const d = new Date(t + offsetHours * 3_600_000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    date: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
    key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
  };
}

function wilderAtr(a: Candle[], n = 14): number[] {
  const tr = a.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const p = a[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - p), Math.abs(c.low - p));
  });
  const out = new Array(a.length).fill(NaN);
  let ema = NaN;
  const alpha = 1 / n;
  for (let i = 0; i < tr.length; i++) {
    if (i < n - 1) continue;
    if (!Number.isFinite(ema)) {
      let s = 0;
      for (let j = i - n + 1; j <= i; j++) s += tr[j];
      ema = s / n;
    } else {
      ema = alpha * tr[i] + (1 - alpha) * ema;
    }
    out[i] = ema;
  }
  return out;
}

function bollingerZ(a: Candle[], n = 20): number[] {
  const out = new Array(a.length).fill(NaN);
  for (let i = n - 1; i < a.length; i++) {
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += a[j].close;
    const mean = s / n;
    let ss = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const d = a[j].close - mean;
      ss += d * d;
    }
    const sd = Math.sqrt(ss / n);
    if (sd > 0) out[i] = (a[i].close - mean) / sd;
  }
  return out;
}

function sessionVwap(a: Candle[]): number[] {
  const out = new Array(a.length).fill(NaN);
  let current = "";
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < a.length; i++) {
    const local = brokerLocal(a[i].time);
    if (local.key !== current) {
      current = local.key;
      pv = 0;
      vol = 0;
    }
    const tp = (a[i].high + a[i].low + a[i].close) / 3;
    const w = Math.max(1, a[i].volume);
    pv += tp * w;
    vol += w;
    out[i] = pv / vol;
  }
  return out;
}

function metrics(trades: Trade[], initialEquity: number, finalEquity: number, spanDays: number) {
  const rs = trades.map((t) => t.r);
  const wins = rs.filter((r) => r > 0);
  const losses = rs.filter((r) => r <= 0);
  const gp = wins.reduce((s, r) => s + r, 0);
  const gl = -losses.reduce((s, r) => s + r, 0);
  let eqR = 0;
  let peakR = 0;
  let ddR = 0;
  for (const r of rs) {
    eqR += r;
    peakR = Math.max(peakR, eqR);
    ddR = Math.max(ddR, peakR - eqR);
  }
  const months = new Map<string, number>();
  for (const t of trades) {
    const d = new Date(t.exitTime);
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    months.set(k, (months.get(k) ?? 0) + t.r);
  }
  const mv = [...months.values()];
  return {
    trades: trades.length,
    winRate: +(trades.length ? wins.length / trades.length * 100 : 0).toFixed(1),
    netR: +rs.reduce((s, r) => s + r, 0).toFixed(2),
    avgR: +(trades.length ? rs.reduce((s, r) => s + r, 0) / trades.length : 0).toFixed(3),
    profitFactor: +(gl ? gp / gl : gp > 0 ? 99 : 0).toFixed(2),
    maxDrawdownR: +ddR.toFixed(2),
    returnPct: +((finalEquity / initialEquity - 1) * 100).toFixed(2),
    tradesPerDay: +(trades.length / Math.max(1, spanDays * 5 / 7)).toFixed(2),
    positiveMonths: +(mv.length ? mv.filter((x) => x > 0).length / mv.length : 0).toFixed(2),
    exits: {
      STOP: trades.filter((t) => t.reason === "stop").length,
      TARGET: trades.filter((t) => t.reason === "target").length,
      SIGNAL: trades.filter((t) => t.reason === "signal").length,
      WEEKEND: trades.filter((t) => t.reason === "weekend").length,
      END: trades.filter((t) => t.reason === "end").length,
    },
  };
}

function runStatic(a: Candle[], costScale = 1) {
  const atr = wilderAtr(a, 14);
  const z = bollingerZ(a, 20);
  const vwap = sessionVwap(a);

  const initialEquity = 10_000;
  let equity = initialEquity;
  const riskPerTrade = 0.005;
  const slippage = 0.02 * costScale;
  const minStop = 1.0;
  const stopAtr = 1.5;
  const holdBars = 24;
  const momentumExitBars = 3;
  const zEntry = 1.5;
  const minVwapDistance = 2.0 * 0.08 * costScale;

  const targetPos = new Int8Array(a.length);
  const signalStop = new Array(a.length).fill(NaN);
  const signalTarget = new Array(a.length).fill(NaN);

  let signalPos = 0;
  let barsIn = 0;
  let downStreak = 0;

  for (let i = 0; i < a.length; i++) {
    const c = a[i];
    if (signalPos !== 0) {
      barsIn += 1;
      if (i > 0 && c.close < a[i - 1].close) downStreak += 1;
      else downStreak = 0;

      const exitNow =
        (Number.isFinite(vwap[i]) && c.close >= vwap[i]) ||
        barsIn >= holdBars ||
        downStreak >= momentumExitBars;

      if (exitNow) {
        targetPos[i] = 0;
        signalPos = 0;
        barsIn = 0;
        downStreak = 0;
      } else {
        targetPos[i] = 1;
        signalStop[i] = c.close - stopAtr * atr[i];
      }
      continue;
    }

    const local = brokerLocal(c.time);
    if (local.hour !== 22 && local.hour !== 23) continue;
    if (!Number.isFinite(z[i]) || !Number.isFinite(atr[i]) || atr[i] <= 0) continue;
    if (!Number.isFinite(vwap[i])) continue;
    if (z[i] >= -zEntry) continue;
    if (vwap[i] - c.close < minVwapDistance) continue;

    signalPos = 1;
    targetPos[i] = 1;
    signalStop[i] = c.close - stopAtr * atr[i];
    signalTarget[i] = vwap[i];
    barsIn = 1;
    downStreak = 0;
  }

  const trades: Trade[] = [];
  let pos = 0;
  let size = 0;
  let entry = NaN;
  let entryIndex = -1;
  let stop = NaN;
  let target = NaN;
  let riskBudget = 0;

  const closeTrade = (i: number, rawExit: number, reason: string) => {
    const halfSpread = 0.5 * Math.max(0, a[i].spread) * costScale;
    const effectiveExit = rawExit - (halfSpread + slippage);
    const pnl = (effectiveExit - entry) * size;
    equity += pnl;
    trades.push({
      entryTime: a[entryIndex].time,
      exitTime: a[i].time,
      entry,
      exit: effectiveExit,
      stop,
      target,
      riskBudget,
      pnl,
      r: riskBudget > 0 ? pnl / riskBudget : 0,
      reason,
    });
    pos = 0;
    size = 0;
    entry = NaN;
    entryIndex = -1;
    stop = NaN;
    target = NaN;
    riskBudget = 0;
  };

  for (let i = 0; i < a.length; i++) {
    if (pos !== 0 && i > entryIndex) {
      let reason = "";
      let rawExit = NaN;

      const hitStop = Number.isFinite(stop) && a[i].low <= stop;
      const hitTarget = Number.isFinite(target) && a[i].high >= target;
      if (hitStop) {
        reason = "stop";
        rawExit = Math.min(stop, a[i].open);
      } else if (hitTarget) {
        reason = "target";
        rawExit = Math.max(target, a[i].open);
      }

      const local = brokerLocal(a[i].time);
      const nextLocal = i + 1 < a.length ? brokerLocal(a[i + 1].time) : null;
      const isFridayLast =
        local.weekday === 5 &&
        (!nextLocal || nextLocal.weekday !== 5);
      if (!reason && isFridayLast) {
        reason = "weekend";
        rawExit = a[i].close;
      }

      if (reason) closeTrade(i, rawExit, reason);
    }

    if (i + 1 >= a.length) continue;
    const desired = targetPos[i];

    if (pos === 0 && desired !== 0) {
      const next = a[i + 1];
      const nextLocal = brokerLocal(next.time);
      if (nextLocal.weekday === 5 && nextLocal.hour >= 21) continue;

      const halfSpread = 0.5 * Math.max(0, next.spread) * costScale;
      const effectiveEntry = next.open + halfSpread + slippage;
      let newStop = signalStop[i];
      if (!Number.isFinite(newStop) || Math.abs(effectiveEntry - newStop) < minStop) {
        newStop = effectiveEntry - minStop;
      }
      const stopDistance = Math.abs(effectiveEntry - newStop);
      if (stopDistance <= 1e-9) continue;
      const roundTripFriction = 2 * (halfSpread + slippage);
      const lossDistance = stopDistance + roundTripFriction;

      riskBudget = riskPerTrade * equity;
      size = riskBudget / lossDistance;
      pos = 1;
      entry = effectiveEntry;
      entryIndex = i + 1;
      stop = newStop;
      target = signalTarget[i];
    } else if (pos !== 0 && desired === 0) {
      closeTrade(i + 1, a[i + 1].open, "signal");
    }
  }

  if (pos !== 0 && entryIndex >= 0) {
    closeTrade(a.length - 1, a[a.length - 1].close, "end");
  }

  const spanDays = (a[a.length - 1].time - a[0].time) / 86_400_000;
  return {
    ...metrics(trades, initialEquity, equity, spanDays),
    medianObservedSpread: +([...a].map((c) => c.spread).sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0).toFixed(3),
  };
}

export function runGoldveinV3Lab(raw: Raw[]) {
  const candles = prepare(raw);
  if (candles.length < 5000) return { status: "insufficient_data", candles: candles.length };

  const base = runStatic(candles, 1);
  const stress2 = runStatic(candles, 2);
  const stress3 = runStatic(candles, 3);

  const pass =
    base.trades >= 12 &&
    base.avgR > 0.03 &&
    base.profitFactor >= 1.08 &&
    base.positiveMonths >= 0.55 &&
    stress2.avgR > 0;

  return {
    status: "ok",
    model: "GOLDVEIN_LONG_BIAS_SESSION_V3_STATIC_REPLICATION",
    candles: candles.length,
    volumeAvailablePct: +(candles.filter((x) => x.volume > 0).length / candles.length * 100).toFixed(1),
    from: new Date(candles[0].time).toISOString(),
    to: new Date(candles[candles.length - 1].time).toISOString(),
    rules: {
      direction: "LONG only",
      brokerHours: "22:00-23:59 EET/EEST",
      entry: "BB(20) z <= -1.5 and session VWAP - close >= 2 x fixed round-trip friction",
      stop: "1.5 x Wilder ATR14, minimum $1 stop",
      exits: "entry VWAP target OR signal exit after VWAP reclaim / 3 consecutive lower closes / 24 bars",
      fill: "next M5 open",
      risk: "0.5% equity per trade",
      costs: "Capital historical bid/ask spread + $0.02 slippage/side; stress scales both spread and slippage",
      note: "Static modal V3 parameters only; no parameter optimization on Capital data."
    },
    variants: {
      BASE: base,
      COST_2X: stress2,
      COST_3X: stress3,
    },
    pass,
    verdict: pass ? "CANDIDATE_FOR_CROSS_WINDOW_VALIDATION" : "REJECT_OR_KEEP_IN_LAB",
    warning: "Independent replication of the published modal rule. The original 21-year headline is stitched walk-forward using per-fold optimized parameters, so this static test is intentionally stricter."
  };
}
