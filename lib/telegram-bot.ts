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
  const texts=updates.slice(-10).map((u:any)=>String(u?.message?.text||"").trim()).filter(Boolean);
  console.info("[telegram-bind]",{updates:updates.length,texts:texts.map((t:string)=>t.toLowerCase()==="/start"?"/start":"<outro>")});
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