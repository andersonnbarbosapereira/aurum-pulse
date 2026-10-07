
type Raw = any;

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type SessionName = "ASIA" | "EUROPE" | "US";

type SessionBar = {
  date: string;
  session: SessionName;
  start: number;
  end: number;
  open: number;
  close: number;
  ret: number;
};

type Trade = {
  time: number;
  session: SessionName;
  side: -1 | 1;
  ret: number;
  netRet: number;
};

function mid(v: any) {
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
  const open = mid(r?.openPrice);
  const high = mid(r?.highPrice);
  const low = mid(r?.lowPrice);
  const close = mid(r?.closePrice);
  if (![time, open, high, low, close].every(Number.isFinite)) return null;
  return { time, open, high, low, close };
}

function prepare(raw: Raw[]) {
  return raw
    .map(normalize)
    .filter((x): x is Candle => !!x)
    .sort((a, b) => a.time - b.time);
}

function dateKey(t: number) {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function minuteUtc(t: number) {
  const d = new Date(t);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function sessionOf(t: number): SessionName | null {
  const m = minuteUtc(t);
  if (m >= 0 && m < 480) return "ASIA";
  if (m >= 480 && m < 870) return "EUROPE";
  if (m >= 870 && m < 1440) return "US";
  return null;
}

function buildSessions(candles: Candle[]) {
  const groups = new Map<string, Candle[]>();
  for (const c of candles) {
    const s = sessionOf(c.time);
    if (!s) continue;
    const key = dateKey(c.time) + "|" + s;
    const g = groups.get(key) ?? [];
    g.push(c);
    groups.set(key, g);
  }

  const order: SessionName[] = ["ASIA", "EUROPE", "US"];
  const out: SessionBar[] = [];
  for (const [key, g] of groups) {
    const [date, session] = key.split("|") as [string, SessionName];
    g.sort((a, b) => a.time - b.time);
    if (g.length < 4) continue;
    const open = g[0].open;
    const close = g[g.length - 1].close;
    out.push({
      date,
      session,
      start: g[0].time,
      end: g[g.length - 1].time + 15 * 60_000,
      open,
      close,
      ret: close / open - 1
    });
  }

  return out.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return order.indexOf(a.session) - order.indexOf(b.session);
  });
}

function metrics(trades: Trade[]) {
  const r = trades.map((x) => x.netRet);
  const n = r.length;
  const wins = r.filter((x) => x > 0);
  const losses = r.filter((x) => x <= 0);
  const gp = wins.reduce((s, x) => s + x, 0);
  const gl = -losses.reduce((s, x) => s + x, 0);

  let eq = 1;
  let peak = 1;
  let maxDd = 0;
  for (const x of r) {
    eq *= 1 + x;
    peak = Math.max(peak, eq);
    maxDd = Math.max(maxDd, 1 - eq / peak);
  }

  const daily = new Map<string, number>();
  for (const t of trades) {
    const k = dateKey(t.time);
    daily.set(k, (daily.get(k) ?? 0) + t.netRet);
  }
  const dr = [...daily.values()];
  const mean = dr.length ? dr.reduce((s, x) => s + x, 0) / dr.length : 0;
  const variance = dr.length > 1
    ? dr.reduce((s, x) => s + (x - mean) ** 2, 0) / (dr.length - 1)
    : 0;
  const sd = Math.sqrt(variance);
  const sharpe = sd > 0 ? mean / sd * Math.sqrt(252) : 0;

  return {
    trades: n,
    winRate: +(n ? wins.length / n * 100 : 0).toFixed(1),
    totalReturnPct: +((eq - 1) * 100).toFixed(2),
    avgTradeBps: +(n ? r.reduce((s, x) => s + x, 0) / n * 10_000 : 0).toFixed(2),
    profitFactor: +(gl ? gp / gl : gp > 0 ? 99 : 0).toFixed(2),
    maxDrawdownPct: +(maxDd * 100).toFixed(2),
    dailySharpe: +sharpe.toFixed(2),
    longs: trades.filter((x) => x.side === 1).length,
    shorts: trades.filter((x) => x.side === -1).length
  };
}

function buildTrades(
  sessions: SessionBar[],
  mode: "FULL_MOMENTUM" | "LONG_ONLY" | "ASIA_MOMENTUM" | "ASIA_LONG_ONLY",
  costPerPositionChange = 0.0002
) {
  const trades: Trade[] = [];
  let prev: SessionBar | null = null;

  for (const cur of sessions) {
    if (!prev) {
      prev = cur;
      continue;
    }

    const isAdjacent =
      (prev.session === "ASIA" && cur.session === "EUROPE" && prev.date === cur.date) ||
      (prev.session === "EUROPE" && cur.session === "US" && prev.date === cur.date) ||
      (prev.session === "US" && cur.session === "ASIA" && cur.date > prev.date);

    if (!isAdjacent) {
      prev = cur;
      continue;
    }

    const signal = prev.ret >= 0 ? 1 : -1;
    let side: -1 | 1 | 0 = 0;

    if (mode === "FULL_MOMENTUM") side = signal;
    if (mode === "LONG_ONLY") side = signal > 0 ? 1 : 0;
    if (mode === "ASIA_MOMENTUM" && cur.session === "ASIA") side = signal;
    if (mode === "ASIA_LONG_ONLY" && cur.session === "ASIA") side = signal > 0 ? 1 : 0;

    if (side !== 0) {
      const gross = cur.ret * side;
      trades.push({
        time: cur.end,
        session: cur.session,
        side,
        ret: gross,
        netRet: gross - costPerPositionChange
      });
    }

    prev = cur;
  }

  return trades;
}

function autocorr(xs: number[]) {
  if (xs.length < 3) return 0;
  const a = xs.slice(1);
  const b = xs.slice(0, -1);
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

export function runSessionFlowLab(raw: Raw[]) {
  const candles = prepare(raw);
  const sessions = buildSessions(candles);
  if (sessions.length < 100) {
    return { status: "insufficient_data", candles: candles.length, sessions: sessions.length };
  }

  const modes = ["FULL_MOMENTUM", "LONG_ONLY", "ASIA_MOMENTUM", "ASIA_LONG_ONLY"] as const;
  const variants: any = {};
  for (const mode of modes) {
    variants[mode] = metrics(buildTrades(sessions, mode, 0.0002));
  }

  const bySession: any = {};
  for (const s of ["ASIA", "EUROPE", "US"] as SessionName[]) {
    const rs = sessions.filter((x) => x.session === s).map((x) => x.ret);
    const sum = rs.reduce((a, b) => a + b, 0);
    bySession[s] = {
      observations: rs.length,
      meanBps: +(rs.length ? sum / rs.length * 10_000 : 0).toFixed(2),
      lag1Autocorr: +autocorr(rs).toFixed(3)
    };
  }

  const best = Object.entries(variants)
    .map(([id, m]: any) => ({ id, ...m }))
    .sort((a, b) => b.dailySharpe - a.dailySharpe)[0];

  const pass =
    best.trades >= 30 &&
    best.dailySharpe >= 0.8 &&
    best.profitFactor >= 1.15 &&
    best.maxDrawdownPct <= 15 &&
    best.totalReturnPct > 0;

  return {
    status: "ok",
    model: "SESSION_FLOW_V1",
    candles: candles.length,
    sessions: sessions.length,
    from: new Date(candles[0].time).toISOString(),
    to: new Date(candles[candles.length - 1].time).toISOString(),
    rules: {
      sessions: "Asia 00:00-08:00 UTC; Europe 08:00-14:30 UTC; US 14:30-24:00 UTC",
      signal: "direction of immediately preceding session return",
      cost: "0.02% deducted per traded session",
      variants: {
        FULL_MOMENTUM: "long/short next session in direction of previous session",
        LONG_ONLY: "long next session only when previous session was positive",
        ASIA_MOMENTUM: "trade only Asia, long/short based on previous US session",
        ASIA_LONG_ONLY: "trade only Asia, long only when previous US session was positive"
      }
    },
    bySession,
    variants,
    best,
    pass,
    verdict: pass ? "CANDIDATE_FOR_CROSS_WINDOW_VALIDATION" : "REJECT_OR_KEEP_IN_LAB",
    warning: "Independent implementation inspired by published session-momentum research. Paper sample was 2024-2026 and not a true holdout; our multi-window Capital.com tests decide promotion."
  };
}
