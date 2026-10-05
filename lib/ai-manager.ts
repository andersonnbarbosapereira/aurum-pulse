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
  if (r >= 1.5) {
    action = "PROTEGER";
    suggestedStop = ctx.entry;
    reason = "A operação avançou pelo menos 1,5R; proteger o capital sem ampliar o risco original passa a ser permitido.";
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
  if (["PROTEGER","BREAKEVEN","TRAILING"].includes(d.action) && r < 1.5) {
    return { ...d, action:"MANTER", suggestedStop:null, reason:`Portão de risco: ${d.reason} | Proteção bloqueada antes de 1,5R para não sufocar o movimento normal.` };
  }
  if (d.action === "PARCIAL" && r < 1.5) {
    return { ...d, action:"MANTER", partialPercent:null, reason:`Portão de risco: ${d.reason} | Parcial bloqueada antes de 1,5R.` };
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

  const originalRisk = Math.abs(ctx.entry - ctx.originalStop) || 1;
  const stopDistanceR = Math.abs(ctx.currentPrice - ctx.originalStop) / originalRisk;
  const state = ctx.unrealizedR > 0 ? "EM_GANHO" : ctx.unrealizedR < 0 ? "EM_PERDA" : "NEUTRO";
  const system = `Você é o gestor de risco contextual do Aurum Pulse para XAUUSD. Responda sempre em português.\n\nRegras absolutas:\n1. Nunca aumente o risco original. Nunca afaste o stop para além do stop original.\n2. O stop original é a invalidação máxima e não pode ser removido.\n3. O estado e o R atual fornecidos são fatos numéricos: não os contradiga.\n4. Diferencie pullback saudável de quebra objetiva da tese. Viés contrário isoladamente não invalida a operação.\n5. Antes de +1,5R, prefira MANTER salvo invalidação estrutural forte.\n6. Ações permitidas: MANTER, PROTEGER, BREAKEVEN, TRAILING, PARCIAL, ENCERRAR.\n7. Não invente dados ausentes.\n8. Priorize estrutura, liquidez, deslocamento, BOS/CHoCH, OB/FVG e comportamento multi-timeframe informados no contexto.`;

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
        { role: "user", content: JSON.stringify({ ...ctx, estado: state, rAtual: +ctx.unrealizedR.toFixed(2), distanciaStopR: +stopDistanceR.toFixed(2) }) }
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
