import type { LiveFinalSnapshot } from "@/lib/live-final-engine";

function required(name:string){
  const v=process.env[name];
  if(!v)throw new Error(name+"_MISSING");
  return v;
}

export async function callShadowWrite(body:any){
  const url=required("SUPABASE_URL");
  const anon=required("SUPABASE_ANON_KEY");
  const secret=required("SHADOW_WRITE_SECRET");
  const res=await fetch(url+"/functions/v1/shadow-write",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":"Bearer "+anon,
      "apikey":anon,
      "x-shadow-secret":secret
    },
    body:JSON.stringify(body),
    cache:"no-store"
  });
  const text=await res.text();
  if(!res.ok)throw new Error("SHADOW_WRITE_"+res.status+":"+text);
  return text?JSON.parse(text):{ok:true};
}

export async function shadowHealth(){return callShadowWrite({action:"health"});}

export async function recordShadowSignal(snapshot:LiveFinalSnapshot){
  const d=snapshot.dna;
  if(!d)return{recorded:false,reason:"AGUARDAR"};
  const signalKey=[d.version,d.signalTime,d.side,d.modelEntry,d.originalStop,d.engines.join("+")].join("|");
  const payload={
    signal_key:signalKey,
    engine_version:d.version,
    signal_time:d.signalTime,
    observed_at:d.observedAt,
    model_entry:d.modelEntry,
    side:d.side,
    signal_class:d.signalClass,
    engines:d.engines,
    score:d.score,
    entry:d.entry,
    original_stop:d.originalStop,
    target_2r:d.target2R,
    target_3r:d.target3R,
    risk_points:d.riskPoints,
    risk_percent:d.riskPercent,
    estimated_risk_usd_001:d.estimatedRiskUsd001,
    confirmations:d.confirmations,
    thesis:d.thesis,
    invalidation:d.invalidation,
    current_price:snapshot.price,
    ai_state:null
  };
  const result=await callShadowWrite({payload});
  return{recorded:true,signalKey,result};
}

export async function getBoundTelegramChat(){return callShadowWrite({action:"get_chat"});}
export async function bindTelegramChat(chat:any){return callShadowWrite({action:"bind_chat",chat});}
