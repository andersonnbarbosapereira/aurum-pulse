type Raw = any;
type Side = 1 | -1;

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type Trade = {
  signalTime: number;
  entryTime: number;
  exitTime: number;
  side: Side;
  entry: number;
  stop: number;
  target: number;
  grossR: number;
  netR: number;
  reason: string;
};

function mid(v: any): number {
  const b = Number(v?.bid);
  const a = Number(v?.ask ?? v?.offer);
  if (Number.isFinite(b) && Number.isFinite(a)) return (b + a) / 2;
  if (Number.isFinite(b)) return b;
  if (Number.isFinite(a)) return a;
  return NaN;
}

function norm(r: Raw): Candle | null {
  const rawTime = String(r?.snapshotTimeUTC ?? r?.snapshotTime ?? r?.time ?? "");
  const time = Date.parse(rawTime.endsWith("Z") ? rawTime : rawTime + "Z");
  const open = mid(r?.openPrice);
  const high = mid(r?.highPrice);
  const low = mid(r?.lowPrice);
  const close = mid(r?.closePrice);
  if (![time, open, high, low, close].every(Number.isFinite)) return null;
  return { time, open, high, low, close };
}

function prep(raw: Raw[]) {
  return raw.map(norm).filter((x): x is Candle => !!x).sort((a, b) => a.time - b.time);
}

function aggregate(a: Candle[], minutes: number) {
  const size = minutes * 60_000;
  const groups = new Map<number, Candle[]>();
  for (const c of a) {
    const key = Math.floor(c.time / size) * size;
    const z = groups.get(key) ?? [];
    z.push(c);
    groups.set(key, z);
  }
  const out: Candle[] = [];
  for (const [time, z0] of [...groups.entries()].sort((x, y) => x[0] - y[0])) {
    const z = [...z0].sort((x, y) => x.time - y.time);
    out.push({
      time,
      open: z[0].open,
      high: Math.max(...z.map((x) => x.high)),
      low: Math.min(...z.map((x) => x.low)),
      close: z[z.length - 1].close
    });
  }
  return out;
}

function ema(vals: number[], period: number) {
  const out = new Array(vals.length).fill(NaN);
  const k = 2 / (period + 1);
  let e = NaN;
  for (let i = 0; i < vals.length; i++) {
    e = Number.isFinite(e) ? vals[i] * k + e * (1 - k) : vals[i];
    out[i] = e;
  }
  return out;
}

function sma(vals: number[], period: number) {
  const out = new Array(vals.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < vals.length; i++) {
    sum += vals[i];
    if (i >= period) sum -= vals[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function atr(a: Candle[], period = 14) {
  const tr = a.map((c, i) => i === 0
    ? c.high - c.low
    : Math.max(c.high - c.low, Math.abs(c.high - a[i - 1].close), Math.abs(c.low - a[i - 1].close))
  );
  const out = new Array(a.length).fill(NaN);
  let w = NaN;
  for (let i = 0; i < tr.length; i++) {
    if (i === period) {
      let s = 0;
      for (let j = 1; j <= period; j++) s += tr[j];
      w = s / period;
      out[i] = w;
    } else if (i > period) {
      w = (w * (period - 1) + tr[i]) / period;
      out[i] = w;
    }
  }
  return out;
}

function alignClosed(exec: Candle[], htf: Candle[], vals: number[], minutes: number) {
  const out = new Array(exec.length).fill(NaN);
  const duration = minutes * 60_000;
  let j = 0;
  let last = NaN;
  for (let i = 0; i < exec.length; i++) {
    while (j < htf.length && htf[j].time + duration <= exec[i].time) {
      last = vals[j];
      j++;
    }
    out[i] = last;
  }
  return out;
}

function metrics(trades: Trade[], spanDays: number) {
  const r = trades.map((x) => x.netR);
  const n = r.length;
  const wins = r.filter((x) => x > 0);
  const losses = r.filter((x) => x < 0);
  const gp = wins.reduce((s, x) => s + x, 0);
  const gl = -losses.reduce((s, x) => s + x, 0);
  let eq = 0, peak = 0, dd = 0;
  const months = new Map<string, number>();
  for (const t of trades) {
    eq += t.netR;
    peak = Math.max(peak, eq);
    dd = Math.max(dd, peak - eq);
    const d = new Date(t.exitTime);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    months.set(key, (months.get(key) ?? 0) + t.netR);
  }
  const mv = [...months.values()];
  return {
    trades: n,
    winRate: +(n ? wins.length / n * 100 : 0).toFixed(1),
    netR: +r.reduce((s, x) => s + x, 0).toFixed(2),
    avgR: +(n ? r.reduce((s, x) => s + x, 0) / n : 0).toFixed(3),
    profitFactor: +(gl ? gp / gl : gp > 0 ? 99 : 0).toFixed(2),
    maxDrawdownR: +dd.toFixed(2),
    tradesPerDay: +(n / Math.max(1, spanDays * 5 / 7)).toFixed(2),
    positiveMonths: +(mv.length ? mv.filter((x) => x > 0).length / mv.length : 0).toFixed(2),
    longs: trades.filter((x) => x.side === 1).length,
    shorts: trades.filter((x) => x.side === -1).length
  };
}

function simulateFixed(
  a: Candle[],
  signals: { index: number; side: Side; stop: number; target: number }[],
  costPoints: number,
  maxBars: number
) {
  const sig = new Map(signals.map((x) => [x.index, x]));
  const out: Trade[] = [];
  let open: any = null;

  for (let i = 1; i < a.length; i++) {
    if (open) {
      const c = a[i];
      let rawExit: number | null = null;
      let reason = "";
      if (open.side === 1) {
        if (c.low <= open.stop) {
          rawExit = open.stop;
          reason = "STOP";
        } else if (c.high >= open.target) {
          rawExit = open.target;
          reason = "TARGET";
        }
      } else {
        if (c.high >= open.stop) {
          rawExit = open.stop;
          reason = "STOP";
        } else if (c.low <= open.target) {
          rawExit = open.target;
          reason = "TARGET";
        }
      }
      if (rawExit === null && i - open.entryIndex >= maxBars) {
        rawExit = c.close;
        reason = "TIME";
      }
      if (rawExit !== null) {
        const risk = Math.abs(open.entry - open.stop);
        const grossR = ((rawExit - open.entry) * open.side) / risk;
        const netR = grossR - costPoints / risk;
        out.push({
          signalTime: open.signalTime,
          entryTime: open.entryTime,
          exitTime: c.time,
          side: open.side,
          entry: open.entry,
          stop: open.stop,
          target: open.target,
          grossR,
          netR,
          reason
        });
        open = null;
      }
    }

    if (!open) {
      const s = sig.get(i - 1);
      if (!s) continue;
      const entry = a[i].open;
      const signalClose = a[i - 1].close;
      const riskFromSignal = Math.abs(signalClose - s.stop);
      if (!(riskFromSignal > 0)) continue;
      const stop = s.side === 1
        ? entry - riskFromSignal
        : entry + riskFromSignal;
      const rewardFromSignal = Math.abs(s.target - signalClose);
      const target = s.side === 1
        ? entry + rewardFromSignal
        : entry - rewardFromSignal;
      const risk = Math.abs(entry - stop);
      if (risk / entry > 0.004 || risk / entry < 0.00025) continue;
      open = {
        side: s.side,
        entry,
        stop,
        target,
        signalTime: a[i - 1].time,
        entryTime: a[i].time,
        entryIndex: i
      };
    }
  }
  return out;
}

function lowfreqSignals(m5: Candle[], daily: Candle[]) {
  const h1 = aggregate(m5, 60);
  const closes = h1.map((x) => x.close);
  const e21 = ema(closes, 21);
  const a14 = atr(h1, 14);
  const a50 = sma(a14.map((x) => Number.isFinite(x) ? x : 0), 50);
  const dailySma100 = sma(daily.map((x) => x.close), 100);
  const trend = alignClosed(h1, daily, dailySma100, 1440);
  const gate = new Array(h1.length).fill(false);
  let streak = 0;
  for (let i = 0; i < h1.length; i++) {
    const ok = Number.isFinite(a14[i]) && Number.isFinite(a50[i]) && a14[i] > a50[i];
    streak = ok ? streak + 1 : 0;
    gate[i] = streak >= 3;
  }

  const signals: { index: number; side: Side; stop: number; target: number }[] = [];
  for (let i = 100; i < h1.length - 1; i++) {
    if (!gate[i] || !Number.isFinite(trend[i]) || !Number.isFinite(e21[i]) || !Number.isFinite(a14[i])) continue;
    const c = h1[i];
    const tol = 0.0015;
    let side: Side | 0 = 0;
    if (c.close > trend[i] && c.low <= e21[i] * (1 + tol) && c.close > e21[i]) side = 1;
    else if (c.close < trend[i] && c.high >= e21[i] * (1 - tol) && c.close < e21[i]) side = -1;
    if (!side) continue;
    const stop = c.close - side * 1.5 * a14[i];
    const target = c.close + side * 2.5 * a14[i];
    signals.push({ index: i, side, stop, target });
  }
  return { h1, signals };
}

function mtfSignals(m5: Candle[], mode: "RECLAIM" | "BREAK") {
  const m15 = aggregate(m5, 15);
  const h1 = aggregate(m5, 60);

  const e15f = ema(m15.map((x) => x.close), 50);
  const e15s = ema(m15.map((x) => x.close), 200);
  const e1f = ema(h1.map((x) => x.close), 50);
  const e1s = ema(h1.map((x) => x.close), 200);
  const m15Fast = alignClosed(m5, m15, e15f, 15);
  const m15Slow = alignClosed(m5, m15, e15s, 15);
  const h1Fast = alignClosed(m5, h1, e1f, 60);
  const h1Slow = alignClosed(m5, h1, e1s, 60);

  const e20 = ema(m5.map((x) => x.close), 20);
  const a14 = atr(m5, 14);
  const h1Atr = atr(h1, 14);
  const h1AtrSma = sma(h1Atr.map((x) => Number.isFinite(x) ? x : 0), 50);
  const h1GateRaw = h1Atr.map((x, i) => Number.isFinite(x) && Number.isFinite(h1AtrSma[i]) && x > h1AtrSma[i] ? 1 : 0);
  const h1Gate = alignClosed(m5, h1, h1GateRaw, 60);

  const signals: { index: number; side: Side; stop: number; target: number }[] = [];
  for (let i = 220; i < m5.length - 1; i++) {
    if (![m15Fast[i], m15Slow[i], h1Fast[i], h1Slow[i], e20[i], a14[i]].every(Number.isFinite)) continue;
    if (h1Gate[i] !== 1) continue;

    const bull = m15Fast[i] > m15Slow[i] && h1Fast[i] > h1Slow[i];
    const bear = m15Fast[i] < m15Slow[i] && h1Fast[i] < h1Slow[i];
    if (!bull && !bear) continue;

    const c = m5[i];
    const p = m5[i - 1];
    const body = Math.abs(c.close - c.open);
    let side: Side | 0 = 0;

    if (mode === "RECLAIM") {
      if (bull && p.close <= e20[i - 1] && c.close > e20[i]) side = 1;
      else if (bear && p.close >= e20[i - 1] && c.close < e20[i]) side = -1;
    } else {
      const pullLong = p.low <= e20[i - 1] * 1.0005;
      const pullShort = p.high >= e20[i - 1] * 0.9995;
      if (bull && pullLong && c.close > p.high && c.close > c.open && body >= 0.5 * a14[i]) side = 1;
      else if (bear && pullShort && c.close < p.low && c.close < c.open && body >= 0.5 * a14[i]) side = -1;
    }

    if (!side) continue;
    const risk = mode === "BREAK"
      ? Math.max(0.8 * a14[i], side === 1 ? c.close - Math.min(p.low, c.low) : Math.max(p.high, c.high) - c.close)
      : 1.5 * a14[i];
    const rr = mode === "BREAK" ? 2.0 : (2.5 / 1.5);
    const stop = c.close - side * risk;
    const target = c.close + side * risk * rr;
    signals.push({ index: i, side, stop, target });
  }

  return { signals };
}

export function runMtfTrendPullbackLab(raw5: Raw[], rawDay: Raw[], evalDays = 120) {
  const m5 = prep(raw5);
  const daily = prep(rawDay);
  if (m5.length < 8000 || daily.length < 120) {
    return { status: "insufficient_data", m5: m5.length, daily: daily.length };
  }

  const last = m5[m5.length - 1].time;
  const evalStart = last - evalDays * 86_400_000;
  const span = evalDays;
  const specs: { id: string; candles: Candle[]; signals: any[]; maxBars: number }[] = [];

  const low = lowfreqSignals(m5, daily);
  specs.push({ id: "LOWFREQ_V2", candles: low.h1, signals: low.signals, maxBars: 72 });

  const reclaim = mtfSignals(m5, "RECLAIM");
  specs.push({ id: "MTF_RECLAIM", candles: m5, signals: reclaim.signals, maxBars: 72 });

  const brk = mtfSignals(m5, "BREAK");
  specs.push({ id: "MTF_BREAK", candles: m5, signals: brk.signals, maxBars: 72 });

  const variants: any = {};
  for (const spec of specs) {
    for (const cost of [0.5, 1.5]) {
      const all = simulateFixed(spec.candles, spec.signals, cost, spec.maxBars);
      const trades = all.filter((x) => x.entryTime >= evalStart);
      variants[spec.id + (cost === 0.5 ? "_BASE" : "_STRESS")] = metrics(trades, span);
    }
  }

  const ranking = ["LOWFREQ_V2", "MTF_RECLAIM", "MTF_BREAK"]
    .map((id) => ({ id, base: variants[id + "_BASE"], stress: variants[id + "_STRESS"] }))
    .sort((a, b) => b.base.avgR - a.base.avgR);

  return {
    status: "ok",
    model: "MTF_TREND_PULLBACK_FIXED_V1",
    m5Candles: m5.length,
    dailyCandles: daily.length,
    evaluationFrom: new Date(evalStart).toISOString(),
    to: new Date(last).toISOString(),
    rules: {
      LOWFREQ_V2: "Daily SMA100 regime + H1 EMA21 pullback/bounce + ATR14 > SMA50(ATR14) for >=3 H1 bars; SL1.5ATR TP2.5ATR",
      MTF_RECLAIM: "H1 & M15 EMA50/200 aligned + H1 ATR expansion + M5 EMA20 recross; SL1.5ATR, TP2.5ATR equivalent",
      MTF_BREAK: "H1 & M15 EMA50/200 aligned + H1 ATR expansion + prior M5 touches EMA20 + current breaks prior extreme with body >=0.5ATR; structural/0.8ATR stop, 2R",
      execution: "signal uses closed bar; entry next bar open; stop-first on same-bar stop/target; one trade at a time",
      costs: "0.50 XAU points round-trip baseline, 1.50 points stress"
    },
    variants,
    ranking,
    warning: "Three parameter-fixed hypotheses derived from independent public implementations. No parameter sweep on Capital data; any candidate must survive multiple time windows and untouched HistData before forward."
  };
}
