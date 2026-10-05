export type AiManagementAction = "MANTER" | "PROTEGER" | "BREAKEVEN" | "TRAILING" | "PARCIAL" | "ENCERRAR";

export type AiTradeContext = {
  symbol: "XAUUSD";
  side: "LONG" | "SHORT";
  entry: number;
  originalStop: number;
  currentStop: number;
  target1?: number | null;
  target2?: number | null;
  currentPrice: number;
  lot: number;
  unrealizedR: number;
  mfeR?: number | null;
  maeR?: number | null;
  setupName?: string | null;
  reasons?: string[];
  market: {
    bias?: string | null;
    regime?: string | null;
    structure?: string | null;
    factors?: Array<{ label: string; score: number; note: string }>;
  };
};

export type AiManagementDecision = {
  action: AiManagementAction;
  suggestedStop: number | null;
  partialPercent: number | null;
  confidence: number;
  reason: string;
  evidences: string[];
  thesisStillValid: boolean;
  riskCanIncrease: false;
  provider: "groq" | "fallback";
  model: string;
};

const allowed = new Set<AiManagementAction>(["MANTER","PROTEGER","BREAKEVEN","TRAILING","PARCIAL","ENCERRAR"]);

function fallbackDecision(ctx: AiTradeContext): AiManagementDecision {
  const originalRisk = Math.abs(ctx.entry - ctx.originalStop) || 1;
  const favorable = ctx.side === "LONG" ? ctx.currentPrice - ctx.entry : ctx.entry - ctx.currentPrice;
  const r = favorable / originalRisk;
  let action: AiManagementAction = "MANTER";
  let suggestedStop: number | null = null;
  let partialPercent: number | null = null;
  let reason = "A tese permanece dentro do risco originalmente definido; sem evidência suficiente para intervenção antecipada.";
  if (r >= 1.2) {
    action = "PROTEGER";
    suggestedStop = ctx.entry;
    reason = "A operação avançou mais de 1R; proteger o capital sem ampliar o risco original é razoável.";
  } else if (r <= -0.8) {
    action = "MANTER";
    reason = "A operação está pressionada, porém ainda antes da invalidação original. O gestor determinístico não encerra sem quebra objetiva da tese.";
  }
  return { action, suggestedStop, partialPercent, confidence: 35, reason, evidences:[`R atual aproximado: ${r.toFixed(2)}`], thesisStillValid:true, riskCanIncrease:false, provider:"fallback", model:"deterministic-fallback" };
}

function sanitizeStop(ctx: AiTradeContext, proposed: unknown): number | null {
  const n = Number(proposed);
  if (!Number.isFinite(n)) return null;
  // A IA nunca pode afastar o stop e aumentar o risco original.
  if (ctx.side === "LONG") {
    if (n < ctx.originalStop || n > ctx.currentPrice) return null;
    return Math.max(n, ctx.currentStop);
  }
  if (n > ctx.originalStop || n < ctx.currentPrice) return null;
  return Math.min(n, ctx.currentStop);
}

export async function manageTradeWithAi(ctx: AiTradeContext): Promise<AiManagementDecision> {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  if (!apiKey) return fallbackDecision(ctx);

  const system = `Você é o gestor de risco contextual do Aurum Pulse para XAUUSD. Responda sempre em português e APENAS em JSON válido.\n\nRegras absolutas:\n1. Nunca aumente o risco original. Nunca afaste o stop para além do stop original.\n2. O stop original é a invalidação máxima e não pode ser removido.\n3. Diferencie pullback saudável de quebra de tese. Não encerre apenas porque o preço está temporariamente contra.\n4. Ações permitidas: MANTER, PROTEGER, BREAKEVEN, TRAILING, PARCIAL, ENCERRAR.\n5. Se sugerir stop, ele deve reduzir ou manter o risco, nunca ampliar.\n6. Não invente dados ausentes.\n7. Priorize estrutura, liquidez, displacement, BOS/CHoCH, OB/FVG e comportamento multi-timeframe informados no contexto.\n\nFormato JSON: {"action":"MANTER|PROTEGER|BREAKEVEN|TRAILING|PARCIAL|ENCERRAR","suggestedStop":number|null,"partialPercent":number|null,"confidence":0-100,"reason":"texto curto","evidences":["..."],"thesisStillValid":boolean}`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_completion_tokens: 700,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(ctx) }
      ]
    }),
    cache: "no-store"
  });
  if (!response.ok) return fallbackDecision(ctx);
  const data = await response.json();
  const text = String(data?.choices?.[0]?.message?.content || "").trim();
  let parsed: any;
  try { parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim()); }
  catch { return fallbackDecision(ctx); }
  const action: AiManagementAction = allowed.has(parsed?.action) ? parsed.action : "MANTER";
  const suggestedStop = sanitizeStop(ctx, parsed?.suggestedStop);
  const partial = Number(parsed?.partialPercent);
  return {
    action,
    suggestedStop,
    partialPercent: action === "PARCIAL" && Number.isFinite(partial) ? Math.max(10, Math.min(90, partial)) : null,
    confidence: Math.max(0, Math.min(100, Number(parsed?.confidence) || 50)),
    reason: String(parsed?.reason || "Sem justificativa detalhada."),
    evidences: Array.isArray(parsed?.evidences) ? parsed.evidences.slice(0,6).map(String) : [],
    thesisStillValid: Boolean(parsed?.thesisStillValid),
    riskCanIncrease: false,
    provider: "groq",
    model
  };
}
