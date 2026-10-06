import { NextResponse } from "next/server";
import { getLiveFinalSnapshot } from "@/lib/live-final-engine";
import { formatTelegramSignal } from "@/lib/telegram-signal";

export const dynamic="force-dynamic";

export async function GET(){
  try{
    const snapshot=await getLiveFinalSnapshot();
    return NextResponse.json({
      mode:"telegram-preview",
      execution:"MANUAL_ONLY",
      hasSignal:!!snapshot.dna,
      message:formatTelegramSignal(snapshot),
      dna:snapshot.dna
    },{headers:{"X-Robots-Tag":"noindex"}});
  }catch(error){
    return NextResponse.json({status:"unavailable",error:"Não foi possível montar a prévia do sinal.",diagnostic:error instanceof Error?error.message:"UNKNOWN_ERROR"},{status:502});
  }
}
