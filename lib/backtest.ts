type RawCandle = any;

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type BacktestTrade = {
  side: "LONG" | "SHORT";
  signalTime: string;
  entryTime: string;
  entry: number;
  stop: number;
  take: number;
  rr: number;
  result: "TP" | "SL" | "EXPIRED";
  rMultiple: number;
  fibonacciFilter: boolean;
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

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let value = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) value = values[i] * k + value * (1 - k);
  return value;
}

function completedAt(candles: Candle[], now: number, tfMinutes: number) {
  const cutoff = now - tfMinutes * 60_000;
  return candles.filter(c => c.time <= cutoff);
}

function fibFilter(m15: Candle[], side: "LONG" | "SHORT", price: number) {
  const lookback = m15.slice(-24);
  if (lookback.length < 12) return { pass: false, zone: [0, 0] as [number, number] };
  const high = Math.max(...lookback.map(c => c.high));
  const low = Math.min(...lookback.map(c => c.low));
  const range = high - low;
  if (range <= 0) return { pass: false, zone: [0, 0] as [number, number] };
  const a = side === "LONG" ? high - range * 0.618 : low + range * 0.5;
  const b = side === "LONG" ? high - range * 0.5 : low + range * 0.618;
  const zone: [number, number] = [Math.min(a, b), Math.max(a, b)];
  return { pass: price >= zone[0] && price <= zone[1], zone };
}

function evaluateVariant(m5: Candle[], useFib: boolean): BacktestTrade[] {
  const m15all = aggregate(m5, 15);
  const h1all = aggregate(m5, 60);
  const trades: BacktestTrade[] = [];
  let blockedUntil = -1;

  for (let i = 80; i < m5.length - 1; i++) {
    if (i <= blockedUntil) continue;
    const signal = m5[i];
    const now = signal.time + 5 * 60_000;
    const h1 = completedAt(h1all, now, 60);
    const m15 = completedAt(m15all, now, 15);
    if (h1.length < 55 || m15.length < 30) continue;

    const h1Closes = h1.map(c => c.close);
    const e20 = ema(h1Closes, 20);
    const e50 = ema(h1Closes, 50);
    if (e20 === null || e50 === null) continue;

    const side: "LONG" | "SHORT" | null = e20 > e50 ? "LONG" : e20 < e50 ? "SHORT" : null;
    if (!side) continue;

    const recent15 = m15.slice(-8);
    const prior15 = m15.slice(-16, -8);
    if (prior15.length < 8) continue;
    const recentMean = recent15.reduce((s, c) => s + c.close, 0) / recent15.length;
    const priorMean = prior15.reduce((s, c) => s + c.close, 0) / prior15.length;
    const m15Aligned = side === "LONG" ? recentMean > priorMean : recentMean < priorMean;
    if (!m15Aligned) continue;

    const prev = m5[i - 1];
    const prev2 = m5[i - 2];
    const trigger = side === "LONG"
      ? signal.close > prev.high && prev.low <= prev2.low
      : signal.close < prev.low && prev.high >= prev2.high;
    if (!trigger) continue;

    const fib = fibFilter(m15, side, signal.close);
    if (useFib && !fib.pass) continue;

    const entryCandle = m5[i + 1];
    const entry = entryCandle.open;
    const structure = m5.slice(Math.max(0, i - 6), i + 1);
    const structuralStop = side === "LONG"
      ? Math.min(...structure.map(c => c.low))
      : Math.max(...structure.map(c => c.high));
    const risk = Math.abs(entry - structuralStop);
    if (risk <= 0 || risk / entry > 0.006) continue;
    const take = side === "LONG" ? entry + risk * 2 : entry - risk * 2;

    let result: "TP" | "SL" | "EXPIRED" = "EXPIRED";
    let rMultiple = 0;
    let exitIndex = Math.min(i + 36, m5.length - 1);
    for (let j = i + 1; j <= exitIndex; j++) {
      const c = m5[j];
      const stopHit = side === "LONG" ? c.low <= structuralStop : c.high >= structuralStop;
      const tpHit = side === "LONG" ? c.high >= take : c.low <= take;
      // Conservative when both are touched in the same candle: count stop first.
      if (stopHit) { result = "SL"; rMultiple = -1; exitIndex = j; break; }
      if (tpHit) { result = "TP"; rMultiple = 2; exitIndex = j; break; }
    }
    if (result === "EXPIRED") {
      const exit = m5[exitIndex].close;
      rMultiple = side === "LONG" ? (exit - entry) / risk : (entry - exit) / risk;
      rMultiple = Math.max(-1, Math.min(2, rMultiple));
    }

    trades.push({
      side,
      signalTime: new Date(signal.time).toISOString(),
      entryTime: new Date(entryCandle.time).toISOString(),
      entry: Number(entry.toFixed(2)),
      stop: Number(structuralStop.toFixed(2)),
      take: Number(take.toFixed(2)),
      rr: 2,
      result,
      rMultiple: Number(rMultiple.toFixed(3)),
      fibonacciFilter: useFib,
      reasons: [
        `H1 EMA20 ${side === "LONG" ? ">" : "<"} EMA50`,
        `M15 momentum alinhado com ${side}`,
        `M5 confirmou quebra de microestrutura`,
        useFib ? `Preço dentro da retração Fibonacci 50%-61,8%` : `Fibonacci não exigido`
      ]
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
    tradesPerDay: Number((trades.length / days).toFixed(2))
  };
}

export function runBacktest(raw: RawCandle[]) {
  const m5 = raw.map(normalize).filter((c): c is Candle => c !== null).sort((a, b) => a.time - b.time);
  const withoutFib = evaluateVariant(m5, false);
  const withFib = evaluateVariant(m5, true);
  const first = m5[0]?.time;
  const last = m5[m5.length - 1]?.time;
  return {
    methodology: {
      lookahead: false,
      entryTiming: "signal confirmed at M5 close; entry at next M5 open",
      bias: "H1 EMA20 vs EMA50",
      setup: "M15 momentum alignment",
      trigger: "M5 microstructure break after local pullback",
      stop: "recent M5 structural invalidation",
      target: "2R",
      fibTest: "compare identical strategy with and without 50%-61.8% retracement filter"
    },
    sample: {
      barsM5: m5.length,
      from: first ? new Date(first).toISOString() : null,
      to: last ? new Date(last).toISOString() : null
    },
    variants: {
      withoutFibonacci: { metrics: metrics(withoutFib, first, last), trades: withoutFib },
      withFibonacci: { metrics: metrics(withFib, first, last), trades: withFib }
    }
  };
}
