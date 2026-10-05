type RawCandle = any;

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type Side = "LONG" | "SHORT";
type Zone = { low: number; high: number; time: number; kind: "OB" | "FVG" };
type Swing = { index: number; time: number; price: number; type: "HIGH" | "LOW" };

export type BacktestTrade = {
  side: Side;
  signalTime: string;
  entryTime: string;
  entry: number;
  stop: number;
  take: number;
  rr: number;
  result: "TP" | "SL" | "EXPIRED";
  rMultiple: number;
  score: number;
  reasons: string[];
};

function mid(v: any): number | null {
  if (!v) return null;
  const bid = Number(v.bid);
  const ask = Number(v.ask ?? v.offer);
  if (Number.isFinite(bid) && Number.isFinite(ask)) return (bid + ask) / 2;
  if (Number.isFinite(bid)) return bid;
  if (Number.isFinite(ask)) return ask;
  return null;
}

export function normalize(raw: RawCandle): Candle | null {
  const open = mid(raw?.openPrice);
  const high = mid(raw?.highPrice);
  const low = mid(raw?.lowPrice);
  const close = mid(raw?.closePrice);
  const stamp = raw?.snapshotTimeUTC ?? raw?.snapshotTime;
  const time = stamp ? Date.parse(stamp.endsWith?.("Z") ? stamp : `${stamp}Z`) : NaN;
  if ([open, high, low, close].some(v => v === null) || !Number.isFinite(time)) return null;
  return { time, open: open!, high: high!, low: low!, close: close! };
}

function aggregate(source: Candle[], minutes: number): Candle[] {
  const size = minutes * 60_000;
  const out: Candle[] = [];
  let bucket = -1;
  let current: Candle | null = null;
  for (const c of source) {
    const b = Math.floor(c.time / size) * size;
    if (b !== bucket) {
      if (current) out.push(current);
      bucket = b;
      current = { time: b, open: c.open, high: c.high, low: c.low, close: c.close };
    } else if (current) {
      current.high = Math.max(current.high, c.high);
      current.low = Math.min(current.low, c.low);
      current.close = c.close;
    }
  }
  if (current) out.push(current);
  return out;
}

function completedAt(candles: Candle[], now: number, tfMinutes: number) {
  const cutoff = now - tfMinutes * 60_000;
  return candles.filter(c => c.time <= cutoff);
}

function range(c: Candle) { return Math.max(0.000001, c.high - c.low); }
function body(c: Candle) { return Math.abs(c.close - c.open); }
function bullish(c: Candle) { return c.close > c.open; }
function bearish(c: Candle) { return c.close < c.open; }
function overlaps(price: number, z: Zone | null, tolerance = 0) {
  return !!z && price >= z.low - tolerance && price <= z.high + tolerance;
}

// Confirmed pivots only: the right-hand candles must already be closed.
function swings(candles: Candle[], left = 2, right = 2): Swing[] {
  const out: Swing[] = [];
  for (let i = left; i < candles.length - right; i++) {
    const c = candles[i];
    let isHigh = true, isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
    }
    if (isHigh) out.push({ index: i, time: c.time, price: c.high, type: "HIGH" });
    if (isLow) out.push({ index: i, time: c.time, price: c.low, type: "LOW" });
  }
  return out.sort((a, b) => a.time - b.time);
}

function flow(candles: Candle[]): Side | null {
  const s = swings(candles.slice(-90));
  const highs = s.filter(x => x.type === "HIGH").slice(-2);
  const lows = s.filter(x => x.type === "LOW").slice(-2);
  if (highs.length < 2 || lows.length < 2) return null;
  const up = highs[1].price > highs[0].price && lows[1].price > lows[0].price;
  const down = highs[1].price < highs[0].price && lows[1].price < lows[0].price;
  return up ? "LONG" : down ? "SHORT" : null;
}

function latestLeg(candles: Candle[], side: Side) {
  const s = swings(candles.slice(-100));
  if (side === "LONG") {
    const highs = s.filter(x => x.type === "HIGH");
    const h = highs.at(-1);
    if (!h) return null;
    const lows = s.filter(x => x.type === "LOW" && x.time < h.time);
    const l = lows.at(-1);
    if (!l || h.price <= l.price) return null;
    return { start: l.price, end: h.price, startTime: l.time, endTime: h.time };
  }
  const lows = s.filter(x => x.type === "LOW");
  const l = lows.at(-1);
  if (!l) return null;
  const highs = s.filter(x => x.type === "HIGH" && x.time < l.time);
  const h = highs.at(-1);
  if (!h || h.price <= l.price) return null;
  return { start: h.price, end: l.price, startTime: h.time, endTime: l.time };
}

function fibZone(candles: Candle[], side: Side): Zone | null {
  const leg = latestLeg(candles, side);
  if (!leg) return null;
  const r = Math.abs(leg.end - leg.start);
  if (!r) return null;
  const a = side === "LONG" ? leg.end - r * 0.786 : leg.end + r * 0.618;
  const b = side === "LONG" ? leg.end - r * 0.618 : leg.end + r * 0.786;
  return { low: Math.min(a, b), high: Math.max(a, b), time: leg.endTime, kind: "OB" };
}

function latestFvg(candles: Candle[], side: Side): Zone | null {
  for (let i = candles.length - 1; i >= 2 && i >= candles.length - 35; i--) {
    const a = candles[i - 2], c = candles[i];
    if (side === "LONG" && c.low > a.high) return { low: a.high, high: c.low, time: c.time, kind: "FVG" };
    if (side === "SHORT" && c.high < a.low) return { low: c.high, high: a.low, time: c.time, kind: "FVG" };
  }
  return null;
}

function latestOrderBlock(candles: Candle[], side: Side, maxLookback = 45): Zone | null {
  if (candles.length < 5) return null;
  const start = Math.max(1, candles.length - maxLookback);
  for (let i = candles.length - 3; i >= start; i--) {
    const base = candles[i];
    const n1 = candles[i + 1], n2 = candles[i + 2];
    const displacement = Math.abs(n2.close - base.close);
    const localRanges = candles.slice(Math.max(0, i - 8), i + 1).map(range);
    const avgRange = localRanges.reduce((a, b) => a + b, 0) / Math.max(1, localRanges.length);
    if (side === "LONG") {
      const broke = n2.close > Math.max(...candles.slice(Math.max(0, i - 8), i + 1).map(c => c.high));
      if (bearish(base) && bullish(n1) && bullish(n2) && displacement > avgRange * 1.15 && broke) {
        return { low: base.low, high: Math.max(base.open, base.close), time: base.time, kind: "OB" };
      }
    } else {
      const broke = n2.close < Math.min(...candles.slice(Math.max(0, i - 8), i + 1).map(c => c.low));
      if (bullish(base) && bearish(n1) && bearish(n2) && displacement > avgRange * 1.15 && broke) {
        return { low: Math.min(base.open, base.close), high: base.high, time: base.time, kind: "OB" };
      }
    }
  }
  return null;
}

function candlePattern(candles: Candle[], side: Side) {
  if (candles.length < 2) return null;
  const c = candles.at(-1)!;
  const p = candles.at(-2)!;
  const upper = c.high - Math.max(c.open, c.close);
  const lower = Math.min(c.open, c.close) - c.low;
  const r = range(c);
  if (side === "LONG") {
    if (bullish(c) && bearish(p) && c.open <= p.close && c.close >= p.open) return "bullish engulfing";
    if (lower >= r * 0.45 && c.close > c.open && c.close >= c.low + r * 0.65) return "bullish rejection/pin";
  } else {
    if (bearish(c) && bullish(p) && c.open >= p.close && c.close <= p.open) return "bearish engulfing";
    if (upper >= r * 0.45 && c.close < c.open && c.close <= c.low + r * 0.35) return "bearish rejection/pin";
  }
  return null;
}

function liquiditySweep(candles: Candle[], side: Side) {
  if (candles.length < 12) return false;
  const c = candles.at(-1)!;
  const prior = candles.slice(-11, -1);
  if (side === "LONG") {
    const level = Math.min(...prior.map(x => x.low));
    return c.low < level && c.close > level;
  }
  const level = Math.max(...prior.map(x => x.high));
  return c.high > level && c.close < level;
}

function microBos(candles: Candle[], side: Side) {
  if (candles.length < 8) return false;
  const c = candles.at(-1)!;
  const prior = candles.slice(-7, -1);
  return side === "LONG" ? c.close > Math.max(...prior.map(x => x.high)) : c.close < Math.min(...prior.map(x => x.low));
}

function defendedFib(candles: Candle[], side: Side, fib: Zone | null) {
  if (!fib || candles.length < 2) return false;
  const c = candles.at(-1)!;
  const touched = c.low <= fib.high && c.high >= fib.low;
  if (!touched) return false;
  const midpoint = (fib.low + fib.high) / 2;
  return side === "LONG" ? c.close > midpoint && bullish(c) : c.close < midpoint && bearish(c);
}

function candidateScore(params: {
  side: Side; h4: Candle[]; h1: Candle[]; m15: Candle[]; m5: Candle[];
}) {
  const { side, h4, h1, m15, m5 } = params;
  let score = 0;
  const reasons: string[] = [];
  const h4Flow = flow(h4);
  const h1Flow = flow(h1);
  const m15Flow = flow(m15);
  const fib = fibZone(m15, side);
  const m5Ob = latestOrderBlock(m5, side, 36);
  const macroOb = latestOrderBlock(h1, side, 55) ?? latestOrderBlock(h4, side, 55);
  const fvg5 = latestFvg(m5, side);
  const fvg15 = latestFvg(m15, side);
  const price = m5.at(-1)!.close;
  const tol = range(m5.at(-1)!) * 0.25;

  if (h1Flow === side) { score += 24; reasons.push(`H1 fluxo estrutural ${side}`); }
  if (h4Flow === side) { score += 12; reasons.push(`H4 contexto macro ${side}`); }
  else if (h4Flow && h4Flow !== side) { score -= 8; reasons.push(`H4 contrário ao intraday`); }
  if (m15Flow === side) { score += 14; reasons.push(`M15 estrutura alinhada`); }

  if (defendedFib(m5, side, fib)) { score += 16; reasons.push(`Fibonacci 61,8%-78,6% defendido`); }
  else if (overlaps(price, fib, tol)) { score += 8; reasons.push(`Preço em Fibonacci 61,8%-78,6%`); }

  if (overlaps(price, m5Ob, tol)) { score += 11; reasons.push(`Mitigação de order block M5`); }
  if (overlaps(price, macroOb, tol * 3)) { score += 8; reasons.push(`Order block macro H1/H4 em confluência`); }
  if (overlaps(price, fvg5, tol)) { score += 8; reasons.push(`FVG M5 em confluência`); }
  else if (overlaps(price, fvg15, tol * 2)) { score += 6; reasons.push(`FVG M15 em confluência`); }

  if (liquiditySweep(m5, side)) { score += 12; reasons.push(`Sweep de liquidez M5`); }
  const pattern = candlePattern(m5, side);
  if (pattern) { score += 10; reasons.push(`Padrão de candle: ${pattern}`); }
  if (microBos(m5, side)) { score += 12; reasons.push(`BOS de microestrutura M5`); }

  return { score, reasons, fib, m5Ob, macroOb, fvg5, fvg15, h1Flow, h4Flow, m15Flow };
}

function evaluate(m5: Candle[], minScore = 58, rr = 1.5): BacktestTrade[] {
  const m15all = aggregate(m5, 15);
  const h1all = aggregate(m5, 60);
  const h4all = aggregate(m5, 240);
  const trades: BacktestTrade[] = [];
  let blockedUntil = -1;

  for (let i = 160; i < m5.length - 1; i++) {
    if (i <= blockedUntil) continue;
    const signal = m5[i];
    const now = signal.time + 5 * 60_000;
    const m5hist = m5.slice(0, i + 1);
    const m15 = completedAt(m15all, now, 15);
    const h1 = completedAt(h1all, now, 60);
    const h4 = completedAt(h4all, now, 240);
    if (m15.length < 45 || h1.length < 45 || h4.length < 30) continue;

    // H1 is primary intraday flow; M15 can take over only when H1 is neutral and H4 does not oppose.
    const h1f = flow(h1);
    const m15f = flow(m15);
    const h4f = flow(h4);
    let side: Side | null = h1f;
    if (!side && m15f && h4f !== (m15f === "LONG" ? "SHORT" : "LONG")) side = m15f;
    if (!side) continue;

    const c = candidateScore({ side, h4, h1, m15, m5: m5hist });
    if (c.score < minScore) continue;

    // Require an actual execution trigger, not score alone.
    const trigger = microBos(m5hist, side) && (!!candlePattern(m5hist, side) || liquiditySweep(m5hist, side) || defendedFib(m5hist, side, c.fib));
    if (!trigger) continue;

    const entryCandle = m5[i + 1];
    const entry = entryCandle.open;
    const recent = m5.slice(Math.max(0, i - 10), i + 1);
    const structural = side === "LONG" ? Math.min(...recent.map(c => c.low)) : Math.max(...recent.map(c => c.high));
    const obStop = c.m5Ob ? (side === "LONG" ? c.m5Ob.low : c.m5Ob.high) : structural;
    const rawStop = side === "LONG" ? Math.min(structural, obStop) : Math.max(structural, obStop);
    const buffer = Math.max(entry * 0.00008, range(signal) * 0.08);
    const stop = side === "LONG" ? rawStop - buffer : rawStop + buffer;
    const risk = Math.abs(entry - stop);
    if (risk <= 0 || risk / entry > 0.0055 || risk / entry < 0.00025) continue;

    const take = side === "LONG" ? entry + risk * rr : entry - risk * rr;

    // There must be enough clean space to the latest opposing swing/zone for >= minimum RR.
    const oppOb = latestOrderBlock(m15, side === "LONG" ? "SHORT" : "LONG", 45);
    if (oppOb) {
      const obstacle = side === "LONG" ? oppOb.low : oppOb.high;
      const roomR = side === "LONG" ? (obstacle - entry) / risk : (entry - obstacle) / risk;
      if (roomR > 0 && roomR < rr) continue;
    }

    let result: "TP" | "SL" | "EXPIRED" = "EXPIRED";
    let rMultiple = 0;
    let exitIndex = Math.min(i + 48, m5.length - 1);
    for (let j = i + 1; j <= exitIndex; j++) {
      const bar = m5[j];
      const stopHit = side === "LONG" ? bar.low <= stop : bar.high >= stop;
      const tpHit = side === "LONG" ? bar.high >= take : bar.low <= take;
      if (stopHit) { result = "SL"; rMultiple = -1; exitIndex = j; break; }
      if (tpHit) { result = "TP"; rMultiple = rr; exitIndex = j; break; }
    }
    if (result === "EXPIRED") {
      const exit = m5[exitIndex].close;
      rMultiple = side === "LONG" ? (exit - entry) / risk : (entry - exit) / risk;
      rMultiple = Math.max(-1, Math.min(rr, rMultiple));
    }

    trades.push({
      side,
      signalTime: new Date(signal.time).toISOString(),
      entryTime: new Date(entryCandle.time).toISOString(),
      entry: Number(entry.toFixed(2)),
      stop: Number(stop.toFixed(2)),
      take: Number(take.toFixed(2)),
      rr,
      result,
      rMultiple: Number(rMultiple.toFixed(3)),
      score: c.score,
      reasons: c.reasons
    });
    blockedUntil = exitIndex;
  }
  return trades;
}

function metrics(trades: BacktestTrade[], firstTime?: number, lastTime?: number) {
  const wins = trades.filter(t => t.rMultiple > 0);
  const losses = trades.filter(t => t.rMultiple < 0);
  const grossWin = wins.reduce((s, t) => s + t.rMultiple, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.rMultiple, 0));
  const totalR = trades.reduce((s, t) => s + t.rMultiple, 0);
  let equity = 0, peak = 0, maxDrawdownR = 0;
  for (const t of trades) {
    equity += t.rMultiple;
    peak = Math.max(peak, equity);
    maxDrawdownR = Math.max(maxDrawdownR, peak - equity);
  }
  const days = firstTime && lastTime ? Math.max(1, (lastTime - firstTime) / 86_400_000) : 1;
  return {
    trades: trades.length,
    winRate: trades.length ? Number((wins.length / trades.length * 100).toFixed(1)) : 0,
    expectancyR: trades.length ? Number((totalR / trades.length).toFixed(3)) : 0,
    totalR: Number(totalR.toFixed(2)),
    profitFactor: grossLoss ? Number((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? 99 : 0,
    maxDrawdownR: Number(maxDrawdownR.toFixed(2)),
    tradesPerDay: Number((trades.length / days).toFixed(2)),
    averageScore: trades.length ? Number((trades.reduce((s, t) => s + t.score, 0) / trades.length).toFixed(1)) : 0
  };
}

export function runBacktest(raw: RawCandle[]) {
  const m5 = raw.map(normalize).filter((c): c is Candle => c !== null).sort((a, b) => a.time - b.time);
  const trades = evaluate(m5, 58, 1.5);
  const first = m5[0]?.time;
  const last = m5[m5.length - 1]?.time;
  return {
    methodology: {
      lookahead: false,
      movingAverages: false,
      entryTiming: "confluence confirmed at M5 close; entry at next M5 open",
      macroContext: "confirmed H4/H1 swing flow + H1/H4 order blocks",
      intradayContext: "M15 structure; M5 order blocks, FVG, liquidity sweep and micro BOS",
      fibonacci: "identified M15 impulse leg; 61.8%-78.6% retracement; extra weight only when visibly defended by M5 close",
      candlePatterns: "engulfing and rejection/pin patterns only inside the confluence process",
      stop: "M5 structural/OB invalidation plus small volatility buffer",
      target: "minimum fixed 1.5R with rejection if an opposing M15 OB blocks the path before 1.5R",
      scoreThreshold: 58
    },
    sample: {
      barsM5: m5.length,
      from: first ? new Date(first).toISOString() : null,
      to: last ? new Date(last).toISOString() : null
    },
    metrics: metrics(trades, first, last),
    trades
  };
}
