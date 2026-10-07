
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
  grossRet: number;
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

function adjacent(prev: SessionBar, cur: SessionBar) {
  return (
    (prev.session === "ASIA" && cur.session === "EUROPE" && prev.date === cur.date) ||
    (prev.session === "EUROPE" && cur.session === "US" && prev.date === cur.date) ||
    (prev.session === "US" && cur.session === "ASIA" && cur.date > prev.date)
  );
}

function mean(xs: number[]) {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

function metrics(trades: Trade[], evalDays: number) {
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
  const mu = mean(dr);
  const variance = dr.length > 1
    ? dr.reduce((s, x) => s + (x - mu) ** 2, 0) / (dr.length - 1)
    : 0;
  const sd = Math.sqrt(variance);
  const sharpe = sd > 0 ? mu / sd * Math.sqrt(252) : 0;

  return {
    trades: n,
    winRate: +(n ? wins.length / n * 100 : 0).toFixed(1),
    totalReturnPct: +((eq - 1) * 100).toFixed(2),
    avgTradeBps: +(n ? mean(r) * 10_000 : 0).toFixed(2),
    profitFactor: +(gl ? gp / gl : gp > 0 ? 99 : 0).toFixed(2),
    maxDrawdownPct: +(maxDd * 100).toFixed(2),
    dailySharpe: +sharpe.toFixed(2),
    tradesPerDay: +(n / Math.max(1, evalDays * 5 / 7)).toFixed(2),
    asia: trades.filter((x) => x.session === "ASIA").length,
    europe: trades.filter((x) => x.session === "EUROPE").length,
    us: trades.filter((x) => x.session === "US").length
  };
}

function buildAdaptiveVariants(sessions: SessionBar[], evalStart: number, cost = 0.0002) {
  const variants: Record<string, Trade[]> = {
    LONG_ONLY_BASE: [],
    EDGE60: [],
    EDGE120: [],
    TREND20: [],
    EDGE60_TREND20: [],
    EDGE20_TREND20: [],
    SESSION20_TREND20: [],
    DUAL20_TREND20: [],
    SIGNED_TREND20: [],
    SIGNED_EDGE20_TREND20: [],
    SIGNED_SESSION20_TREND20: [],
    SIGNED_DUAL20_TREND20: [],
    ROUTER20: [],
    ROUTER20_EDGE60: [],
    ROUTER20_EDGE120: [],
    ROUTER40: [],
    ROUTER20_BLEND60: []
  };

  const history: number[] = [];
  const sessionHistory: Record<SessionName, number[]> = {
    ASIA: [],
    EUROPE: [],
    US: []
  };
  const signedHistory: number[] = [];
  const signedSessionHistory: Record<SessionName, number[]> = {
    ASIA: [],
    EUROPE: [],
    US: []
  };
  const routerGlobal = { cont: [] as number[], rev: [] as number[] };
  const routerSession: Record<SessionName, { cont: number[]; rev: number[] }> = {
    ASIA: { cont: [], rev: [] },
    EUROPE: { cont: [], rev: [] },
    US: { cont: [], rev: [] }
  };
  const router20Realized: number[] = [];
  let baseCandidates = 0;

  for (let i = 1; i < sessions.length; i++) {
    const prev = sessions[i - 1];
    const cur = sessions[i];
    if (!adjacent(prev, cur)) continue;

    const trendSide: -1 | 0 | 1 = i >= 20
      ? (prev.close > sessions[i - 20].close ? 1 : prev.close < sessions[i - 20].close ? -1 : 0)
      : 0;
    const prevSide: -1 | 0 | 1 = prev.ret > 0 ? 1 : prev.ret < 0 ? -1 : 0;

    if (prevSide !== 0) {
      const contNet = cur.ret * prevSide - cost;
      const revNet = -cur.ret * prevSide - cost;
      const rs = routerSession[cur.session];

      const makeRouterTrade = (side: -1 | 1): Trade => ({
        time: cur.end,
        session: cur.session,
        side,
        grossRet: cur.ret * side,
        netRet: cur.ret * side - cost
      });

      const choose = (contScore: number, revScore: number) => {
        const best = Math.max(contScore, revScore);
        if (!(best > 0)) return 0 as -1 | 0 | 1;
        return (contScore >= revScore ? prevSide : -prevSide) as -1 | 1;
      };

      const s20c = rs.cont.slice(-20), s20r = rs.rev.slice(-20);
      if (s20c.length >= 8) {
        const side = choose(mean(s20c), mean(s20r));
        if (side) {
          const candidate = makeRouterTrade(side);
          const gate60 = router20Realized.slice(-60);
          const gate120 = router20Realized.slice(-120);
          if (cur.end >= evalStart) {
            variants.ROUTER20.push(candidate);
            if (gate60.length >= 20 && mean(gate60) > 0) variants.ROUTER20_EDGE60.push(candidate);
            if (gate120.length >= 40 && mean(gate120) > 0) variants.ROUTER20_EDGE120.push(candidate);
          }
          router20Realized.push(candidate.netRet);
        }
      }

      const s40c = rs.cont.slice(-40), s40r = rs.rev.slice(-40);
      if (s40c.length >= 15 && cur.end >= evalStart) {
        const side = choose(mean(s40c), mean(s40r));
        if (side) variants.ROUTER40.push(makeRouterTrade(side));
      }

      const g60c = routerGlobal.cont.slice(-60), g60r = routerGlobal.rev.slice(-60);
      if (s20c.length >= 8 && g60c.length >= 30 && cur.end >= evalStart) {
        const contScore = mean(s20c) * 0.7 + mean(g60c) * 0.3;
        const revScore = mean(s20r) * 0.7 + mean(g60r) * 0.3;
        const side = choose(contScore, revScore);
        if (side) variants.ROUTER20_BLEND60.push(makeRouterTrade(side));
      }

      routerGlobal.cont.push(contNet);
      routerGlobal.rev.push(revNet);
      rs.cont.push(contNet);
      rs.rev.push(revNet);
    }

    if (trendSide !== 0 && prevSide === trendSide) {
      const signedNet = cur.ret * trendSide - cost;
      const signedTrade: Trade = {
        time: cur.end,
        session: cur.session,
        side: trendSide,
        grossRet: cur.ret * trendSide,
        netRet: signedNet
      };
      const sh20All = signedHistory.slice(-20);
      const sh20Session = signedSessionHistory[cur.session].slice(-20);
      const signedEdge20 = sh20All.length >= 12 && mean(sh20All) > 0;
      const signedSession20 = sh20Session.length >= 8 && mean(sh20Session) > 0;

      if (cur.end >= evalStart) {
        variants.SIGNED_TREND20.push(signedTrade);
        if (signedEdge20) variants.SIGNED_EDGE20_TREND20.push(signedTrade);
        if (signedSession20) variants.SIGNED_SESSION20_TREND20.push(signedTrade);
        if (signedEdge20 && signedSession20) variants.SIGNED_DUAL20_TREND20.push(signedTrade);
      }

      signedHistory.push(signedNet);
      signedSessionHistory[cur.session].push(signedNet);
    }

    if (prev.ret < 0) continue;
    baseCandidates++;

    const net = cur.ret - cost;
    const t: Trade = {
      time: cur.end,
      session: cur.session,
      side: 1,
      grossRet: cur.ret,
      netRet: net
    };

    const h20 = history.slice(-20);
    const h60 = history.slice(-60);
    const h120 = history.slice(-120);
    const sh20 = sessionHistory[cur.session].slice(-20);
    const edge20 = h20.length >= 12 && mean(h20) > 0;
    const edge60 = h60.length >= 30 && mean(h60) > 0;
    const edge120 = h120.length >= 60 && mean(h120) > 0;
    const session20 = sh20.length >= 8 && mean(sh20) > 0;
    const trend20 = i >= 20 && prev.close > sessions[i - 20].close;

    if (cur.end >= evalStart) {
      variants.LONG_ONLY_BASE.push(t);
      if (edge60) variants.EDGE60.push(t);
      if (edge120) variants.EDGE120.push(t);
      if (trend20) variants.TREND20.push(t);
      if (edge60 && trend20) variants.EDGE60_TREND20.push(t);
      if (edge20 && trend20) variants.EDGE20_TREND20.push(t);
      if (session20 && trend20) variants.SESSION20_TREND20.push(t);
      if (edge20 && session20 && trend20) variants.DUAL20_TREND20.push(t);
    }

    history.push(net);
    sessionHistory[cur.session].push(net);
  }

  return { variants, baseCandidates };
}

function withCost(trades: Trade[], cost: number) {
  return trades.map((t) => ({ ...t, netRet: t.grossRet - cost }));
}

function autocorr(xs: number[]) {
  if (xs.length < 3) return 0;
  const a = xs.slice(1);
  const b = xs.slice(0, -1);
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

export function runSessionFlowLab(raw: Raw[], evalDays = 180) {
  const candles = prepare(raw);
  const sessions = buildSessions(candles);
  if (sessions.length < 150) {
    return { status: "insufficient_data", candles: candles.length, sessions: sessions.length };
  }

  const lastTime = sessions[sessions.length - 1].end;
  const evalStart = lastTime - evalDays * 86_400_000;
  const built = buildAdaptiveVariants(sessions, evalStart, 0.0002);

  const variants: any = {};
  for (const [id, trades] of Object.entries(built.variants)) {
    variants[id] = metrics(trades, evalDays);
  }

  const evalSessions = sessions.filter((x) => x.end >= evalStart);
  const bySession: any = {};
  for (const s of ["ASIA", "EUROPE", "US"] as SessionName[]) {
    const rs = evalSessions.filter((x) => x.session === s).map((x) => x.ret);
    bySession[s] = {
      observations: rs.length,
      meanBps: +(rs.length ? mean(rs) * 10_000 : 0).toFixed(2),
      lag1Autocorr: +autocorr(rs).toFixed(3)
    };
  }

  const ranking = Object.entries(variants)
    .map(([id, m]: any) => ({ id, ...m }))
    .sort((a, b) => b.dailySharpe - a.dailySharpe);

  const frozenId = "EDGE60_TREND20";
  const frozenTrades = built.variants.EDGE60_TREND20;

  const costStress = {
    COST_2BPS: metrics(withCost(frozenTrades, 0.0002), evalDays),
    COST_4BPS: metrics(withCost(frozenTrades, 0.0004), evalDays),
    COST_6BPS: metrics(withCost(frozenTrades, 0.0006), evalDays),
    COST_10BPS: metrics(withCost(frozenTrades, 0.0010), evalDays)
  };

  const frozenBySession: any = {};
  for (const s of ["ASIA", "EUROPE", "US"] as SessionName[]) {
    frozenBySession[s] = metrics(frozenTrades.filter((t) => t.session === s), evalDays);
  }

  const thirds: any[] = [];
  const thirdMs = (evalDays * 86_400_000) / 3;
  for (let k = 0; k < 3; k++) {
    const lo = evalStart + k * thirdMs;
    const hi = k === 2 ? lastTime + 1 : evalStart + (k + 1) * thirdMs;
    const slice = frozenTrades.filter((t) => t.time >= lo && t.time < hi);
    thirds.push({
      from: new Date(lo).toISOString(),
      to: new Date(Math.min(hi, lastTime)).toISOString(),
      ...metrics(slice, evalDays / 3)
    });
  }

  return {
    status: "ok",
    model: "SESSION_FLOW_ADAPTIVE_V2",
    candles: candles.length,
    sessions: sessions.length,
    from: new Date(candles[0].time).toISOString(),
    evaluationFrom: new Date(evalStart).toISOString(),
    to: new Date(candles[candles.length - 1].time).toISOString(),
    cost: "0.02% per traded session",
    rules: {
      base: "long next session only when immediately preceding session return was positive",
      EDGE60: "base + prior 30-60 base opportunities must have positive net mean; current outcome never used",
      EDGE120: "base + prior 60-120 base opportunities must have positive net mean; current outcome never used",
      TREND20: "base + previous session close above close 20 sessions earlier",
      EDGE60_TREND20: "EDGE60 and TREND20 together",
      EDGE20_TREND20: "fast causal regime gate: prior 12-20 base opportunities positive + TREND20",
      SESSION20_TREND20: "session-specific gate: prior 8-20 opportunities in the same target session positive + TREND20",
      DUAL20_TREND20: "EDGE20 and SESSION20 and TREND20 together; no current outcome used",
      SIGNED_TREND20: "bidirectional: trade only when previous session return agrees with 20-session trend direction",
      SIGNED_EDGE20_TREND20: "SIGNED_TREND20 + prior 12-20 signed opportunities must have positive net mean",
      SIGNED_SESSION20_TREND20: "SIGNED_TREND20 + prior 8-20 signed opportunities in same target session must have positive net mean",
      SIGNED_DUAL20_TREND20: "SIGNED_TREND20 + both global and session-specific causal edge gates",
      ROUTER20: "per target session, choose continuation or reversal from the prior 8-20 realized transitions; abstain if both net means <= 0",
      ROUTER20_EDGE60: "ROUTER20 + causal health gate: prior 20-60 hypothetical ROUTER20 outcomes must have positive net mean",
      ROUTER20_EDGE120: "ROUTER20 + slower causal health gate: prior 40-120 hypothetical ROUTER20 outcomes must have positive net mean",
      ROUTER40: "same causal continuation/reversal router using prior 15-40 transitions per target session",
      ROUTER20_BLEND60: "70% same-session 20-transition edge + 30% global 60-transition edge; choose continuation/reversal or abstain"
    },
    bySession,
    variants,
    ranking,
    frozenCandidate: {
      id: frozenId,
      selectedAfterDevelopment: true,
      costStress,
      bySession: frozenBySession,
      thirds
    },
    warning: "Adaptive gates use only observations available before each decision. Development ranking still creates multiple-testing risk; any selected gate must be frozen before older holdout windows are inspected."
  };
}
