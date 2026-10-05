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

function fallbackDecision(ctx: AiTradeContext, diagnostic="deterministic-fallback"): AiManagementDecision {
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
  return { action, suggestedStop, partialPercent, confidence: 35, reason, evidences:[`R atual aproximado: ${r.toFixed(2)}`], thesisStillValid:true, riskCanIncrease:false, provider:"fallback", model:diagnostic };
}

function sanitizeStop(ctx: AiTradeContext, proposed: unknown): number | null {
  const n = Number(proposed);
  if (!Number.isFinite(n)) return null;
  if (ctx.side === "LONG") {
    if (n < ctx.originalStop || n > ctx.currentPrice) return null;
    return Math.max(n, ctx.currentStop);
  }
  if (n > ctx.originalStop || n < ctx.currentPrice) return null;
  return Math.min(n, ctx.currentStop);
}

function applyPolicyGate(ctx: AiTradeContext, d: AiManagementDecision): AiManagementDecision {
  const r = ctx.unrealizedR;
  if (["PROTEGER","BREAKEVEN","TRAILING"].includes(d.action) && r <= 0.25) {
    return { ...d, action:"MANTER", suggestedStop:null, reason:`Portão de risco: ${d.reason} | Operação ainda não ganhou margem suficiente para proteção.` };
  }
  if (d.action === "PARCIAL" && r < 0.8) {
    return { ...d, action:"MANTER", partialPercent:null, reason:`Portão de risco: ${d.reason} | Parcial bloqueada antes de 0,8R.` };
  }
  if (d.action === "ENCERRAR" && (r > -0.6 || d.thesisStillValid || d.confidence < 85)) {
    return { ...d, action:"MANTER", suggestedStop:null, partialPercent:null, reason:`Portão de risco: ${d.reason} | Encerramento antecipado bloqueado sem invalidação forte.` };
  }
  return d;
}

export async function manageTradeWithAi(ctx: AiTradeContext): Promise<AiManagementDecision> {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  if (!apiKey) return fallbackDecision(ctx,"fallback-no-key");

  const system = `Você é o gestor de risco contextual do Aurum Pulse para XAUUSD. Responda sempre em português.\n\nRegras absolutas:\n1. Nunca aumente o risco original. Nunca afaste o stop para além do stop original.\n2. O stop original é a invalidação máxima e não pode ser removido.\n3. Diferencie pullback saudável de quebra de tese. Não encerre apenas porque o preço está temporariamente contra.\n4. Ações permitidas: MANTER, PROTEGER, BREAKEVEN, TRAILING, PARCIAL, ENCERRAR.\n5. Se sugerir stop, ele deve reduzir ou manter o risco, nunca ampliar.\n6. Não invente dados ausentes.\n7. Priorize estrutura, liquidez, deslocamento, BOS/CHoCH, OB/FVG e comportamento multi-timeframe informados no contexto.\n8. Quando a evidência for insuficiente, prefira MANTER em vez de antecipar uma saída por medo.`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      reasoning_effort: "low",
      include_reasoning: false,
      max_completion_tokens: 500,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "gestao_operacao",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              action: { type: "string", enum: ["MANTER","PROTEGER","BREAKEVEN","TRAILING","PARCIAL","ENCERRAR"] },
              suggestedStop: { anyOf: [{ type: "number" }, { type: "null" }] },
              partialPercent: { anyOf: [{ type: "number" }, { type: "null" }] },
              confidence: { type: "number", minimum: 0, maximum: 100 },
              reason: { type: "string" },
              evidences: { type: "array", items: { type: "string" }, maxItems: 6 },
              thesisStillValid: { type: "boolean" }
            },
            required: ["action","suggestedStop","partialPercent","confidence","reason","evidences","thesisStillValid"]
          }
        }
      },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(ctx) }
      ]
    }),
    cache: "no-store"
  });
  if (!response.ok) return fallbackDecision(ctx,`fallback-http-${response.status}`);
  const data = await response.json();
  const text = String(data?.choices?.[0]?.message?.content || "").trim();
  let parsed: any;
  try { parsed = JSON.parse(text); }
  catch { return fallbackDecision(ctx,"fallback-parse"); }
  const action: AiManagementAction = allowed.has(parsed?.action) ? parsed.action : "MANTER";
  const suggestedStop = sanitizeStop(ctx, parsed?.suggestedStop);
  const partial = Number(parsed?.partialPercent);
  const decision: AiManagementDecision = {
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
  return applyPolicyGate(ctx, decision);
}
