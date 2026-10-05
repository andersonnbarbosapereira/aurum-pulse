import { NextResponse } from "next/server";
import { manageTradeWithAi } from "@/lib/ai-manager";
export const dynamic="force-dynamic";
export async function GET(){const decision=await manageTradeWithAi({symbol:"XAUUSD",side:"LONG",entry:4000,originalStop:3990,currentStop:3990,target1:4015,target2:4020,currentPrice:4005,lot:.01,unrealizedR:.5,mfeR:.6,maeR:-.2,setupName:"Diagnóstico",reasons:["Teste técnico sem operação real"],market:{bias:"LONG",regime:"intraday",structure:"estrutura preservada",factors:[]}});return NextResponse.json({provider:decision.provider,model:decision.model,action:decision.action,confidence:decision.confidence});}
