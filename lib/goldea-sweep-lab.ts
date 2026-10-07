
type Raw = any;
type Side = 1 | -1;

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type BiasRecord = { time: number; bias: number };
type SweepSignal = {
  direction: Side;
  level: string;
  levelPrice: number;
  wickExtreme: number;
};

type Trade = {
  entryTime: number;
  exitTime: number;
  side: Side;
  entry: number;
  exit: number;
  stop: number;
  risk: number;
  grossR: number;
  netR: number;
  exitReason: string;
  sweptLevel: string;
};

function middle(v: any) {
  const bid = Number(v?.bid);
  const ask = Number(v?.ask ?? v?.offer);
  if (Number.isFinite(bid) && Number.isFinite(ask)) return (bid + ask) / 2;
  if (Number.isFinite(bid)) return bid;
  if (Number.isFinite(ask)) return ask;
  return NaN;
}

function normalize(r: Raw): Candle | null {
  const rawTime = String(r?.snapshotTimeUTC ?? r?.snapshotTime ?? r?.time ?? "");
  const time = Date.parse(rawTime.endsWith("Z") ? rawTime : rawTime + "Z");
  const open = middle(r?.openPrice);
  const high = middle(r?.highPrice);
  const low = middle(r?.lowPrice);
  const close = middle(r?.closePrice);
  const volume = Number(r?.lastTradedVolume ?? r?.volume ?? 0);
  if (![time, open, high, low, close].every(Number.isFinite)) return null;
  return { time, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 };
}

function prepare(raw: Raw[]) {
  return raw
    .map(normalize)
    .filter((x): x is Candle => !!x)
    .sort((a, b) => a.time - b.time)
    .filter((c) => c.time + 15 * 60_000 <= Date.now());
}

function lastSunday(year: number, month: number) {
  const d = new Date(Date.UTC(year, month + 1, 0));
  return d.getUTCDate() - d.getUTCDay();
}

function ukLocal(t: number) {
  const y = new Date(t).getUTCFullYear();
  const start = Date.UTC(y, 2, lastSunday(y, 2), 1);
  const end = Date.UTC(y, 9, lastSunday(y, 9), 1);
  const offset = t >= start && t < end ? 1 : 0;
  const d = new Date(t + offset * 3_600_000);
  return {
    date: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
    minute: d.getUTCHours() * 60 + d.getUTCMinutes()
  };
}

function aggregate(candles: Candle[], minutes: number) {
  const size = minutes * 60_000;
  const groups = new Map<number, Candle[]>();
  for (const c of candles) {
    const key = Math.floor(c.time / size) * size;
    const g = groups.get(key) ?? [];
    g.push(c);
    groups.set(key, g);
  }
  const out: Candle[] = [];
  for (const [start, g] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const end = start + size;
    if (end > candles[candles.length - 1].time + 15 * 60_000) continue;
    out.push({
      time: end,
      open: g[0].open,
      high: Math.max(...g.map((x) => x.high)),
      low: Math.min(...g.map((x) => x.low)),
      close: g[g.length - 1].close,
      volume: g.reduce((s, x) => s + x.volume, 0)
    });
  }
  return out;
}

function swingEvents(tf: Candle[], lookback: number, confirm: number) {
  const events: { time: number; kind: "high" | "low"; price: number }[] = [];
  for (let i = lookback; i < tf.length - confirm; i++) {
    const w = tf.slice(i - lookback, i + confirm + 1);
    const maxH = Math.max(...w.map((x) => x.high));
    const minL = Math.min(...w.map((x) => x.low));
    const confirmedAt = tf[i + confirm].time;
    if (tf[i].high === maxH) events.push({ time: confirmedAt, kind: "high", price: tf[i].high });
    if (tf[i].low === minL) events.push({ time: confirmedAt, kind: "low", price: tf[i].low });
  }
  return events.sort((a, b) => a.time - b.time);
}

function biasSeries(tf: Candle[], lookback: number, confirm: number, nSwings = 2): BiasRecord[] {
  const events = swingEvents(tf, lookback, confirm);
  const highs: number[] = [];
  const lows: number[] = [];
  const out: BiasRecord[] = [];
  for (const e of events) {
    if (e.kind === "high") {
      highs.push(e.price);
      while (highs.length > nSwings) highs.shift();
    } else {
      lows.push(e.price);
      while (lows.length > nSwings) lows.shift();
    }

    let bias = 0;
    if (highs.length === nSwings && lows.length === nSwings) {
      const highsRising = highs[1] > highs[0];
      const highsFalling = highs[1] < highs[0];
      const lowsRising = lows[1] > lows[0];
      const lowsFalling = lows[1] < lows[0];
      if (highsRising && lowsRising) bias = 1;
      else if (highsFalling && lowsFalling) bias = -1;
    }
    out.push({ time: e.time, bias });
  }
  return out;
}

function projectBias(candles: Candle[], records: BiasRecord[]) {
  const out = new Array(candles.length).fill(0);
  let j = 0;
  let last = 0;
  for (let i = 0; i < candles.length; i++) {
    const availableAt = candles[i].time + 15 * 60_000;
    while (j < records.length && records[j].time <= availableAt) {
      last = records[j].bias;
      j++;
    }
    out[i] = last;
  }
  return out;
}

function wilderAtr(candles: Candle[], n = 14) {
  const tr = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prev = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
  });
  const out = new Array(candles.length).fill(NaN);
  if (candles.length > n) {
    let initial = 0;
    for (let i = 1; i <= n; i++) initial += tr[i];
    out[n] = initial;
    for (let i = n + 1; i < candles.length; i++) {
      out[i] = (out[i - 1] * (n - 1) + tr[i]) / n;
    }
  }
  return out;
}

function sessionLevels(candles: Candle[]) {
  const days = new Map<string, Candle[]>();
  for (const c of candles) {
    const d = ukLocal(c.time).date;
    const g = days.get(d) ?? [];
    g.push(c);
    days.set(d, g);
  }

  const keys = [...days.keys()].sort();
  const prior = new Map<string, { high: number; low: number }>();
  const asia = new Map<string, { high: number; low: number }>();
  const london = new Map<string, { high: number; low: number }>();

  for (let i = 0; i < keys.length; i++) {
    const d = keys[i];
    const g = days.get(d)!;
    if (i > 0) {
      const p = days.get(keys[i - 1])!;
      prior.set(d, {
        high: Math.max(...p.map((x) => x.high)),
        low: Math.min(...p.map((x) => x.low))
      });
    }
    const a = g.filter((x) => {
      const m = ukLocal(x.time).minute;
      return m >= 0 && m < 480;
    });
    if (a.length) {
      asia.set(d, {
        high: Math.max(...a.map((x) => x.high)),
        low: Math.min(...a.map((x) => x.low))
      });
    }
    const l = g.filter((x) => {
      const m = ukLocal(x.time).minute;
      return m >= 480 && m < 540;
    });
    if (l.length) {
      london.set(d, {
        high: Math.max(...l.map((x) => x.high)),
        low: Math.min(...l.map((x) => x.low))
      });
    }
  }
  return { prior, asia, london };
}

function detectSweeps(candles: Candle[]) {
  const levels = sessionLevels(candles);
  const out: (SweepSignal | null)[] = new Array(candles.length).fill(null);
  const pendingHigh = new Map<string, number>();
  const pendingLow = new Map<string, number>();
  let currentDate = "";

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const local = ukLocal(c.time);
    if (local.date !== currentDate) {
      currentDate = local.date;
      pendingHigh.clear();
      pendingLow.clear();
    }
    const range = c.high - c.low;
    if (range <= 0) continue;

    const p = levels.prior.get(local.date);
    const a = local.minute >= 480 ? levels.asia.get(local.date) : undefined;
    const l = local.minute >= 540 ? levels.london.get(local.date) : undefined;

    const highs: [string, number][] = [];
    const lows: [string, number][] = [];
    if (p) {
      highs.push(["prior_day_high", p.high]);
      lows.push(["prior_day_low", p.low]);
    }
    if (a) {
      highs.push(["asian_high", a.high]);
      lows.push(["asian_low", a.low]);
    }
    if (l) {
      highs.push(["london_open_high", l.high]);
      lows.push(["london_open_low", l.low]);
    }

    for (const [name, price] of highs) {
      if (c.high > price) {
        const prev = pendingHigh.get(name);
        if (prev === undefined || c.high > prev) pendingHigh.set(name, c.high);
      }
    }
    for (const [name, price] of lows) {
      if (c.low < price) {
        const prev = pendingLow.get(name);
        if (prev === undefined || c.low < prev) pendingLow.set(name, c.low);
      }
    }

    let confirmed: SweepSignal | null = null;
    for (const [name, price] of highs) {
      const wick = pendingHigh.get(name);
      if (wick === undefined) continue;
      if (c.close < price && c.high - c.close >= 0.5 * range) {
        confirmed = { direction: -1, level: name, levelPrice: price, wickExtreme: wick };
        pendingHigh.delete(name);
        break;
      }
    }
    if (!confirmed) {
      for (const [name, price] of lows) {
        const wick = pendingLow.get(name);
        if (wick === undefined) continue;
        if (c.close > price && c.close - c.low >= 0.5 * range) {
          confirmed = { direction: 1, level: name, levelPrice: price, wickExtreme: wick };
          pendingLow.delete(name);
          break;
        }
      }
    }
    out[i] = confirmed;
  }
  return out;
}

function anchoredVwap(candles: Candle[], anchorEvents: number[]) {
  const out = new Array(candles.length).fill(NaN);
  let eventIndex = 0;
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < candles.length; i++) {
    const availableAt = candles[i].time + 15 * 60_000;
    let reset = false;
    while (eventIndex < anchorEvents.length && anchorEvents[eventIndex] <= availableAt) {
      eventIndex++;
      reset = true;
    }
    if (reset) {
      pv = 0;
      vol = 0;
    }
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    pv += tp * candles[i].volume;
    vol += candles[i].volume;
    if (vol > 0) out[i] = pv / vol;
  }
  return out;
}

function metrics(trades: Trade[], spanDays: number) {
  const r = trades.map((x) => x.netR);
  const n = r.length;
  const wins = r.filter((x) => x > 0);
  const losses = r.filter((x) => x <= 0);
  const grossWin = wins.reduce((s, x) => s + x, 0);
  const grossLoss = -losses.reduce((s, x) => s + x, 0);
  let eq = 0;
  let peak = 0;
  let dd = 0;
  for (const x of r) {
    eq += x;
    peak = Math.max(peak, eq);
    dd = Math.max(dd, peak - eq);
  }
  const months = new Map<string, number>();
  for (const t of trades) {
    const d = new Date(t.exitTime);
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    months.set(k, (months.get(k) ?? 0) + t.netR);
  }
  const mv = [...months.values()];
  return {
    trades: n,
    winRate: +(n ? (wins.length / n) * 100 : 0).toFixed(1),
    netR: +r.reduce((s, x) => s + x, 0).toFixed(2),
    avgR: +(n ? r.reduce((s, x) => s + x, 0) / n : 0).toFixed(3),
    profitFactor: +(grossLoss ? grossWin / grossLoss : grossWin > 0 ? 99 : 0).toFixed(2),
    maxDrawdownR: +dd.toFixed(2),
    tradesPerDay: +(n / Math.max(1, spanDays * 5 / 7)).toFixed(2),
    positiveMonths: +(mv.length ? mv.filter((x) => x > 0).length / mv.length : 0).toFixed(2),
    longs: trades.filter((x) => x.side === 1).length,
    shorts: trades.filter((x) => x.side === -1).length,
    exits: {
      STOP: trades.filter((x) => x.exitReason === "stop").length,
      VWAP: trades.filter((x) => x.exitReason === "vwap_cross").length,
      SESSION: trades.filter((x) => x.exitReason === "session_close").length
    }
  };
}

function runBacktest(
  candles: Candle[],
  signals: (SweepSignal | null)[],
  bias1h: number[],
  bias4h: number[],
  vwap: number[],
  atr: number[],
  costPoints: number
) {
  const trades: Trade[] = [];
  let open: any = null;

  for (let i = 1; i < candles.length; i++) {
    const row = candles[i];
    const prev = candles[i - 1];

    if (open) {
      let exit: number | null = null;
      let reason = "";
      const rowSession = ukLocal(row.time).date;

      if (rowSession !== open.session) {
        exit = prev.close;
        reason = "session_close";
      } else if (open.side === 1 && row.low <= open.stop) {
        exit = open.stop;
        reason = "stop";
      } else if (open.side === -1 && row.high >= open.stop) {
        exit = open.stop;
        reason = "stop";
      } else if (
        Number.isFinite(vwap[i]) &&
        Number.isFinite(vwap[i - 1]) &&
        open.side === 1 &&
        row.close >= vwap[i] &&
        prev.close < vwap[i - 1]
      ) {
        exit = row.close;
        reason = "vwap_cross";
      } else if (
        Number.isFinite(vwap[i]) &&
        Number.isFinite(vwap[i - 1]) &&
        open.side === -1 &&
        row.close <= vwap[i] &&
        prev.close > vwap[i - 1]
      ) {
        exit = row.close;
        reason = "vwap_cross";
      }

      if (exit !== null) {
        const grossR = ((exit - open.entry) * open.side) / open.risk;
        const netR = grossR - costPoints / open.risk;
        trades.push({
          entryTime: open.entryTime,
          exitTime: row.time,
          side: open.side,
          entry: open.entry,
          exit,
          stop: open.stop,
          risk: open.risk,
          grossR,
          netR,
          exitReason: reason,
          sweptLevel: open.sweptLevel
        });
        open = null;
      }
    }

    if (!open) {
      const s = signals[i];
      if (!s) continue;
      if (bias1h[i] !== s.direction || bias4h[i] !== s.direction) continue;
      if (!Number.isFinite(atr[i]) || atr[i] <= 0) continue;

      const entry = row.close;
      const stop = s.direction === 1
        ? Math.min(entry, s.wickExtreme) - atr[i]
        : Math.max(entry, s.wickExtreme) + atr[i];
      const risk = Math.abs(entry - stop);
      if (risk <= 0) continue;

      open = {
        side: s.direction,
        entry,
        stop,
        risk,
        entryTime: row.time,
        session: ukLocal(row.time).date,
        sweptLevel: s.level
      };
    }
  }
  return trades;
}

export function runGoldEaSweepLab(raw: Raw[]) {
  const candles = prepare(raw);
  if (candles.length < 3000) return { status: "insufficient_data", candles: candles.length };

  const h1 = aggregate(candles, 60);
  const h4 = aggregate(candles, 240);
  const b1 = projectBias(candles, biasSeries(h1, 5, 3, 2));
  const b4 = projectBias(candles, biasSeries(h4, 3, 2, 2));
  const sweeps = detectSweeps(candles);
  const atr = wilderAtr(candles, 14);

  const anchors = swingEvents(h1, 5, 3)
    .map((x) => x.time)
    .sort((a, b) => a - b);
  const vwap = anchoredVwap(candles, anchors);

  const signalCount = sweeps.filter(Boolean).length;
  const alignedSignalCount = sweeps.filter((s, i) => !!s && b1[i] === s.direction && b4[i] === s.direction).length;
  const spanDays = (candles[candles.length - 1].time - candles[0].time) / 86_400_000;
  const costs = [0, 0.5, 1.5];
  const variants: any = {};

  for (const cost of costs) {
    const trades = runBacktest(candles, sweeps, b1, b4, vwap, atr, cost);
    const key = cost === 0 ? "RAW" : cost === 0.5 ? "NET_0_5PT" : "STRESS_1_5PT";
    variants[key] = {
      ...metrics(trades, spanDays),
      levels: {
        PRIOR_DAY: trades.filter((x) => x.sweptLevel.startsWith("prior_day")).length,
        ASIA: trades.filter((x) => x.sweptLevel.startsWith("asian")).length,
        LONDON_OPEN: trades.filter((x) => x.sweptLevel.startsWith("london_open")).length
      }
    };
  }

  const net = variants.NET_0_5PT;
  const pass =
    net.trades >= 25 &&
    net.avgR >= 0.05 &&
    net.profitFactor >= 1.15 &&
    net.positiveMonths >= 0.6 &&
    variants.STRESS_1_5PT.avgR > 0;

  return {
    status: "ok",
    model: "GOLDEA_SWEEP_RECLAIM_REPLICATION_V1",
    candles: candles.length,
    h1Candles: h1.length,
    h4Candles: h4.length,
    volumeAvailablePct: +(candles.filter((x) => x.volume > 0).length / candles.length * 100).toFixed(1),
    from: new Date(candles[0].time).toISOString(),
    to: new Date(candles[candles.length - 1].time).toISOString(),
    rules: {
      execution: "M15",
      levels: "prior UK day H/L + Asia 00:00-08:00 + London open 08:00-09:00",
      trigger: "persistent sweep then reclaim >= 50% of reclaim candle range",
      bias1h: "confirmed swings lookback 5 / confirm 3, last 2 HH+HL or LH+LL",
      bias4h: "confirmed swings lookback 3 / confirm 2, last 2 HH+HL or LH+LL",
      entry: "M15 reclaim close when H1 and H4 bias agree",
      stop: "1 Wilder ATR beyond sweep wick extreme",
      exit: "anchored VWAP cross or UK-session rollover; stop has priority",
      vwapGate: false,
      note: "Capital timestamps are UTC; session levels converted to Europe/London. HTF aggregation uses only completed bars."
    },
    signalCount,
    alignedSignalCount,
    variants,
    pass,
    verdict: pass ? "CANDIDATE_FOR_MULTIWINDOW_VALIDATION" : "REJECT_OR_KEEP_IN_LAB",
    warning: "Independent replication on Capital.com. Public repository statistics are not treated as proof; our own multi-window and forward validation controls promotion."
  };
}
