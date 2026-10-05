import type { Bias, MarketSnapshot } from "@/lib/market";

type Tokens = { cst: string; securityToken: string; expiresAt: number };
let cachedTokens: Tokens | null = null;

const baseUrl = process.env.CAPITAL_ENV === "demo"
  ? "https://demo-api-capital.backend-capital.com/api/v1"
  : "https://api-capital.backend-capital.com/api/v1";

function credentials() {
  const apiKey = process.env.CAPITAL_API_KEY;
  const identifier = process.env.CAPITAL_IDENTIFIER;
  const password = process.env.CAPITAL_API_PASSWORD;
  if (!apiKey || !identifier || !password) {
    throw new Error("CAPITAL_CREDENTIALS_MISSING");
  }
  return { apiKey, identifier, password };
}

async function session(): Promise<Tokens> {
  if (cachedTokens && cachedTokens.expiresAt > Date.now()) return cachedTokens;
  const { apiKey, identifier, password } = credentials();
  const response = await fetch(`${baseUrl}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CAP-API-KEY": apiKey },
    body: JSON.stringify({ identifier, password, encryptedPassword: false }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`CAPITAL_AUTH_${response.status}`);
  const cst = response.headers.get("cst");
  const securityToken = response.headers.get("x-security-token");
  if (!cst || !securityToken) throw new Error("CAPITAL_AUTH_TOKENS_MISSING");
  cachedTokens = { cst, securityToken, expiresAt: Date.now() + 8 * 60 * 1000 };
  return cachedTokens;
}

async function api(path: string) {
  const tokens = await session();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { CST: tokens.cst, "X-SECURITY-TOKEN": tokens.securityToken },
    cache: "no-store"
  });
  if (response.status === 401 || response.status === 403) cachedTokens = null;
  if (!response.ok) throw new Error(`CAPITAL_API_${response.status}`);
  return response.json();
}

async function resolveGoldEpic(): Promise<string> {
  if (process.env.CAPITAL_EPIC) return process.env.CAPITAL_EPIC;
  const data = await api("/markets?searchTerm=gold");
  const markets = Array.isArray(data?.markets) ? data.markets : [];
  const gold = markets.find((m: any) => String(m.instrumentName || m.symbol || "").toLowerCase() === "gold")
    || markets.find((m: any) => String(m.instrumentName || m.symbol || "").toLowerCase().includes("gold"));
  if (!gold?.epic) throw new Error("CAPITAL_GOLD_EPIC_NOT_FOUND");
  return gold.epic;
}

function middle(value: any): number | null {
  if (!value) return null;
  const bid = Number(value.bid);
  const ask = Number(value.ask ?? value.offer);
  if (Number.isFinite(bid) && Number.isFinite(ask)) return (bid + ask) / 2;
  if (Number.isFinite(bid)) return bid;
  if (Number.isFinite(ask)) return ask;
  return null;
}

function closeOf(candle: any): number | null { return middle(candle?.closePrice); }
function highOf(candle: any): number | null { return middle(candle?.highPrice); }
function lowOf(candle: any): number | null { return middle(candle?.lowPrice); }

async function prices(epic: string, resolution: string, max = 120) {
  const data = await api(`/prices/${encodeURIComponent(epic)}?resolution=${resolution}&max=${max}`);
  return Array.isArray(data?.prices) ? data.prices : [];
}

function scoreDirection(candles: any[]) {
  const closes = candles.map(closeOf).filter((n): n is number => n !== null);
  if (closes.length < 20) return 0;
  const recent = closes.slice(-8).reduce((a, b) => a + b, 0) / 8;
  const base = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  return ((recent - base) / base) * 10000;
}

function atrLike(candles: any[]) {
  const ranges = candles.slice(-14).map(c => {
    const h = highOf(c); const l = lowOf(c);
    return h !== null && l !== null ? h - l : null;
  }).filter((n): n is number => n !== null);
  return ranges.length ? ranges.reduce((a,b)=>a+b,0) / ranges.length : 0;
}

export async function getLiveSnapshot(): Promise<MarketSnapshot & { source: string; epic: string; marketStatus?: string }> {
  const epic = await resolveGoldEpic();
  const [marketData, m15, h1, h4] = await Promise.all([
    api(`/markets/${encodeURIComponent(epic)}`),
    prices(epic, "MINUTE_15", 120),
    prices(epic, "HOUR", 120),
    prices(epic, "HOUR_4", 120)
  ]);

  const snapshot = marketData?.snapshot || marketData;
  const bid = Number(snapshot?.bid);
  const offer = Number(snapshot?.offer ?? snapshot?.ask);
  const price = Number.isFinite(bid) && Number.isFinite(offer) ? (bid + offer) / 2 : Number.isFinite(bid) ? bid : offer;
  if (!Number.isFinite(price)) throw new Error("CAPITAL_PRICE_UNAVAILABLE");

  const d15 = scoreDirection(m15);
  const d1 = scoreDirection(h1);
  const d4 = scoreDirection(h4);
  const composite = d15 * 0.25 + d1 * 0.35 + d4 * 0.4;
  const alignedLong = d15 > 0 && d1 > 0 && d4 > 0;
  const alignedShort = d15 < 0 && d1 < 0 && d4 < 0;
  const bias: Bias = alignedLong && composite > 2 ? "LONG" : alignedShort && composite < -2 ? "SHORT" : "WAIT";
  const volatility = atrLike(m15) || Math.max(price * 0.0015, 1);
  const confidence = Math.max(35, Math.min(92, Math.round(50 + Math.min(Math.abs(composite) * 2.2, 32) + (alignedLong || alignedShort ? 10 : 0))));
  const regime = Math.abs(composite) > 7 ? "TREND" : Math.abs(composite) < 2.5 ? "RANGE" : "TRANSITION";
  const direction = bias === "SHORT" ? -1 : 1;
  const entryLow = price - volatility * (bias === "SHORT" ? -0.15 : 0.45);
  const entryHigh = price - volatility * (bias === "SHORT" ? -0.45 : 0.15);
  const zone: [number, number] = [Math.min(entryLow, entryHigh), Math.max(entryLow, entryHigh)].map(n => Number(n.toFixed(2))) as [number, number];
  const stop = Number((bias === "SHORT" ? zone[1] + volatility : zone[0] - volatility).toFixed(2));
  const risk = Math.max(Math.abs(((zone[0] + zone[1]) / 2) - stop), volatility * 0.5);
  const target1 = Number((price + direction * risk * 1.5).toFixed(2));
  const target2 = Number((price + direction * risk * 2.2).toFixed(2));
  const rr = Number((2.2).toFixed(2));

  const structure = bias === "LONG"
    ? "M15, H1 e H4 estão alinhados para cima. O sistema procura compra apenas com preço e risco favoráveis."
    : bias === "SHORT"
      ? "M15, H1 e H4 estão alinhados para baixo. O sistema procura venda apenas com confirmação e assimetria."
      : "Os timeframes ainda não estão suficientemente alinhados. A leitura correta é aguardar em vez de forçar uma operação.";

  return {
    symbol: "XAUUSD",
    price: Number(price.toFixed(2)),
    changePercent: Number(snapshot?.percentageChange ?? 0),
    bias,
    confidence,
    session: "Mercado global",
    regime,
    structure,
    setup: { entryZone: zone, stop, target1, target2, rr },
    factors: [
      { label: "M15", score: Math.max(0, Math.min(100, Math.round(50 + d15 * 2))), note: `impulso ${d15 >= 0 ? "positivo" : "negativo"} no intraday` },
      { label: "H1", score: Math.max(0, Math.min(100, Math.round(50 + d1 * 2))), note: `direção horária ${d1 >= 0 ? "compradora" : "vendedora"}` },
      { label: "H4", score: Math.max(0, Math.min(100, Math.round(50 + d4 * 2))), note: `contexto principal ${d4 >= 0 ? "de alta" : "de baixa"}` },
      { label: "Risco", score: bias === "WAIT" ? 45 : 75, note: bias === "WAIT" ? "sem alinhamento suficiente para entrada" : "setup condicionado à zona e invalidação" }
    ],
    updatedAt: new Date().toISOString(),
    source: "Capital.com",
    epic,
    marketStatus: snapshot?.marketStatus
  };
}
