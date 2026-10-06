import { bindTelegramChat,getBoundTelegramChat } from "@/lib/shadow-recorder";
import type { LiveFinalSnapshot } from "@/lib/live-final-engine";
import { formatTelegramSignal } from "@/lib/telegram-signal";

function token(){const v=process.env.TELEGRAM_BOT_TOKEN;if(!v)throw new Error("TELEGRAM_BOT_TOKEN_MISSING");return v;}
async function tg(method:string,body?:any){
  const res=await fetch("https://api.telegram.org/bot"+token()+"/"+method,{method:body?"POST":"GET",headers:{"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined,cache:"no-store"});
  const data=await res.json();
  if(!res.ok||!data?.ok)throw new Error("TELEGRAM_"+method.toUpperCase()+"_FAILED");
  return data.result;
}
export async function ensureTelegramChat(){
  const bound=await getBoundTelegramChat();
  if(bound?.chat?.chat_id)return{chatId:Number(bound.chat.chat_id),boundNow:false};
  const updates=await tg("getUpdates");
  const start=[...updates].reverse().find((u:any)=>String(u?.message?.text||"").trim().toLowerCase()==="/start"&&u?.message?.chat?.id);
  if(!start)return{chatId:null,boundNow:false};
  const chat=start.message.chat;
  await bindTelegramChat({chat_id:chat.id,chat_type:chat.type,username:chat.username,first_name:chat.first_name});
  await tg("sendMessage",{chat_id:chat.id,text:"✅ Aurum Pulse conectado.\n\nVou enviar apenas novos sinais aprovados pelo FINAL_V1. A execução permanece manual.",disable_web_page_preview:true});
  return{chatId:Number(chat.id),boundNow:true};
}
export async function sendTelegramSignal(snapshot:LiveFinalSnapshot,chatId:number){
  if(!snapshot.dna)return{sent:false,reason:"AGUARDAR"};
  await tg("sendMessage",{chat_id:chatId,text:formatTelegramSignal(snapshot),disable_web_page_preview:true});
  return{sent:true};
}

function px(n:number){return n.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});}

export async function sendTelegramManagement(chatId:number, update:any){
  const ai=update?.ai;
  const lines:string[]=[];
  if(update?.event==="TP2"){
    lines.push("🎯 AURUM PULSE · PARCIAL 2R","",`Preço: ${px(update.currentPrice)}`,"30% da posição virtual realizada.","70% permanece para o alvo principal de 3R.");
  }else if(update?.event==="TP3"){
    lines.push("🏁 AURUM PULSE · ALVO 3R","",`Preço: ${px(update.currentPrice)}`,"Alvo principal atingido. Operação shadow encerrada.");
  }else if(update?.event==="STOP"){
    lines.push("🛑 AURUM PULSE · STOP","",`Preço: ${px(update.currentPrice)}`,"Invalidação estrutural atingida. Operação shadow encerrada.");
  }else if(update?.event==="STOP_APOS_TP2"){
    lines.push("🛡️ AURUM PULSE · RUNNER ENCERRADO","",`Preço: ${px(update.currentPrice)}`,"A parcial de 2R foi preservada; o runner foi encerrado pelo stop vigente.");
  }else if(ai&&ai.action&&ai.action!=="MANTER"){
    lines.push(`🤖 AURUM PULSE IA · ${ai.action}`,"",`R atual: ${Number(update.currentR).toFixed(2)}R`,`MFE: ${Number(update.mfeR).toFixed(2)}R · MAE: ${Number(update.maeR).toFixed(2)}R`);
    if(ai.suggestedStop!=null)lines.push(`Stop sugerido: ${px(Number(ai.suggestedStop))}`);
    if(ai.partialPercent!=null)lines.push(`Parcial sugerida: ${ai.partialPercent}%`);
    lines.push("",String(ai.reason||""),"","⚠️ Gestão informativa. Execução continua manual.");
  }else return {sent:false,reason:"SEM_EVENTO_RELEVANTE"};
  await tg("sendMessage",{chat_id:chatId,text:lines.join("\n"),disable_web_page_preview:true});
  return {sent:true};
}
