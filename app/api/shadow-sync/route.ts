import { NextRequest,NextResponse } from "next/server";
import { getLiveFinalSnapshot } from "@/lib/live-final-engine";
import { recordShadowSignal,shadowHealth } from "@/lib/shadow-recorder";
import { ensureTelegramChat,sendTelegramSignal } from "@/lib/telegram-bot";

export const dynamic="force-dynamic";
export const maxDuration=60;

async function sync(req:NextRequest){
  const expected=process.env.CRON_SECRET;
  const auth=req.headers.get("authorization");
  const cronHeader=req.headers.get("x-cron-secret");
  const authorized=!!expected&&(auth==="Bearer "+expected||cronHeader===expected);
  if(!authorized)return NextResponse.json({error:"unauthorized"},{status:401});
  try{
    const health=await shadowHealth();
    const chat=await ensureTelegramChat();
    const snapshot=await getLiveFinalSnapshot();
    const write=await recordShadowSignal(snapshot);
    let telegram={sent:false as boolean,reason:"SEM_CHAT_OU_SEM_SINAL"};
    if(chat.chatId&&snapshot.dna&&write.recorded&&write.result?.created===true)telegram=await sendTelegramSignal(snapshot,chat.chatId) as any;
    return NextResponse.json({
      ok:true,
      engineVersion:snapshot.engineVersion,
      execution:snapshot.execution,
      marketStatus:snapshot.marketStatus,
      decision:snapshot.dna?(snapshot.dna.side+":"+snapshot.dna.signalClass):"AGUARDAR",
      shadowStorage:health?.ok===true?"ready":"unknown",
      telegramChat:chat.chatId?"bound":"waiting_start",
      telegram,
      ...write
    },{headers:{"X-Robots-Tag":"noindex"}});
  }catch(error){
    return NextResponse.json({ok:false,error:"shadow_sync_failed",diagnostic:error instanceof Error?error.message:"UNKNOWN_ERROR"},{status:502});
  }
}

export const GET=sync;
export const POST=sync;
