export type Bias = "LONG" | "SHORT" | "WAIT";

export type MarketSnapshot = {
  symbol: "XAUUSD";
  price: number;
  changePercent: number;
  bias: Bias;
  confidence: number;
  session: string;
  regime: "TREND" | "RANGE" | "TRANSITION";
  structure: string;
  setup: {
    entryZone: [number, number];
    stop: number;
    target1: number;
    target2: number;
    rr: number;
  };
  factors: Array<{ label: string; score: number; note: string }>;
  updatedAt: string;
};

export function getDemoSnapshot(): MarketSnapshot {
  return {
    symbol: "XAUUSD",
    price: 2671.42,
    changePercent: 0.38,
    bias: "WAIT",
    confidence: 62,
    session: "New York",
    regime: "TRANSITION",
    structure: "Alta no intraday, mas preço ainda abaixo de resistência relevante. Esperar confirmação reduz o risco de perseguir movimento.",
    setup: {
      entryZone: [2664.8, 2668.2],
      stop: 2657.4,
      target1: 2679.5,
      target2: 2688.0,
      rr: 2.05
    },
    factors: [
      { label: "Estrutura", score: 76, note: "fundos ascendentes em M15/H1" },
      { label: "Momentum", score: 68, note: "impulso positivo, ainda sem expansão forte" },
      { label: "Liquidez", score: 55, note: "zona de interesse próxima à máxima anterior" },
      { label: "Risco", score: 84, note: "setup só melhora em pullback; entrada a mercado é ruim" }
    ],
    updatedAt: new Date().toISOString()
  };
}
