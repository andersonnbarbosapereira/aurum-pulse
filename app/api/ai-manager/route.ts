import { NextRequest, NextResponse } from "next/server";
import { manageTradeWithAi, type AiTradeContext } from "@/lib/ai-manager";
import { getLiveFinalSnapshot } from "@/lib/live-final-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: process.env.GROQ_API_KEY ? "ready" : "configuration_required",
    provider: "Groq",
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    actions: ["MANTER","PROTEGER","BREAKEVEN","TRAILING","PARCIAL","ENCERRAR"],
    language: "pt-BR",
    safety: "A IA nunca pode aumentar o risco original nem afastar o stop para além da invalidação inicial."
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const snapshot = await getLiveFinalSnapshot();
    const ctx: AiTradeContext = {
      symbol: "XAUUSD",
      side: body.side,
      entry: Number(body.entry),
      originalStop: Number(body.originalStop),
      currentStop: Number(body.currentStop ?? body.originalStop),
      target1: body.target1 == null ? null : Number(body.target1),
      target2: body.target2 == null ? null : Number(body.target2),
      currentPrice: snapshot.price,
      lot: Number(body.lot ?? 0.01),
      unrealizedR: Number(body.unrealizedR ?? 0),
      mfeR: body.mfeR == null ? null : Number(body.mfeR),
      maeR: body.maeR == null ? null : Number(body.maeR),
      setupName: body.setupName ?? "Reversão de Liquidez",
      reasons: Array.isArray(body.reasons) ? body.reasons.map(String) : (snapshot.dna?.thesis ?? []),
      market: {
        bias: snapshot.bias,
        regime: snapshot.regime,
        structure: snapshot.structure,
        factors: snapshot.factors
      }
    };
    if (!['LONG','SHORT'].includes(ctx.side) || ![ctx.entry,ctx.originalStop,ctx.currentStop].every(Number.isFinite)) {
      return NextResponse.json({ error: "Dados da operação inválidos." }, { status: 400 });
    }
    const decision = await manageTradeWithAi(ctx);
    return NextResponse.json({ source: "Aurum Pulse IA", currentPrice: snapshot.price, decision });
  } catch (error) {
    return NextResponse.json({ error: "Não foi possível analisar a gestão da operação.", diagnostic: error instanceof Error ? error.message : "UNKNOWN_ERROR" }, { status: 500 });
  }
}
