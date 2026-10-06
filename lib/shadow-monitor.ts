import { getHistoricalPrices } from "@/lib/capital";
import type { LiveFinalSnapshot } from "@/lib/live-final-engine";
import { manageTradeWithAi, type AiTradeContext } from "@/lib/ai-manager";
import { callShadowWrite } from "@/lib/shadow-recorder";

type OpenTrade={
  id:string; signal_key:string; signal_time:string; side:"LONG"|"SHORT"; signal_class:string;
  engines:string[]; score:number|string; entry:number|string; original_stop:number|string; current_stop:number|string|null;
  target_2r:number|string; target_3r:number|string; risk_points:number|string; estimated_risk_usd_001:number|string;
  thesis:string[]; status:"OPEN"|"TP2"; current_price:number|string|null; mfe_r:number|string|null; mae_r:number|string|null;
  partial_2r_at:string|null; target_3r_at:string|null; stop_hit_at:string|null;
  last_ai_action:string|null; last_ai_message:string|null; last_ai_at:string|null;
  last_telegram_event:string|null; last_telegram_at:string|null;
};

type Minute={time:number;high:number;low:number;close:number};

function mid(v:any){
  const bid=Number(v?.bid),ask=Number(v?.ask??v?.offer);
  if(Number.isFinite(bid)&&Number.isFinite(ask))return(bid+ask)/2;
  if(Number.isFinite(bid))return bid;
  if(Number.isFinite(ask))return ask;
  return NaN;
}
function norm(raw:any):Minute|null{
  const time=Date.parse(raw?.snapshotTimeUTC||raw?.snapshotTime||raw?.time||"");
  const high=mid(raw?.highPrice),low=mid(raw?.lowPrice),close=mid(raw?.closePrice);
  return Number.isFinite(time)&&Number.isFinite(high)&&Number.isFinite(low)&&Number.isFinite(close)?{time,high,low,close}:null;
}
function rAt(t:OpenTrade,price:number){
  const entry=Number(t.entry),risk=Math.abs(entry-Number(t.original_stop))||1;
  return t.side==="LONG"?(price-entry)/risk:(entry-price)/risk;
}
function favorableR(t:OpenTrade,c:Minute){
  const p=t.side==="LONG"?c.high:c.low;
  return rAt(t,p);
}
function adverseR(t:OpenTrade,c:Minute){
  const p=t.side==="LONG"?c.low:c.high;
  return rAt(t,p);
}
function hitStop(t:OpenTrade,c:Minute,stop:number){
  return t.side==="LONG"?c.low<=stop:c.high>=stop;
}
function hitTarget(t:OpenTrade,c:Minute,target:number){
  return t.side==="LONG"?c.high>=target:c.low<=target;
}

export async function getOpenShadowTrades():Promise<OpenTrade[]>{
  const x=await callShadowWrite({action:"get_open_trades"});
  return Array.isArray(x?.trades)?x.trades:[];
}
export async function updateShadowTrade(id:string,patch:any){
  return callShadowWrite({action:"update_trade",id,patch});
}

export async function monitorOpenTrades(snapshot:LiveFinalSnapshot){
  const trades=await getOpenShadowTrades();
  const results:any[]=[];
  for(const t of trades){
    const from=new Date(Math.max(Date.parse(t.signal_time)-60_000,Date.now()-48*3600_000));
    const raw=await getHistoricalPrices(snapshot.epic,"MINUTE",from,new Date(),1000);
    const observedAt=Date.parse(t.first_seen_at||t.signal_time);
    const candles=raw.map((x:any)=>norm(x)).filter((x:Minute|null):x is Minute=>!!x).filter((c:Minute)=>c.time>=observedAt);
    const entry=Number(t.entry),origStop=Number(t.original_stop),risk=Math.abs(entry-origStop)||1;
    let currentStop=Number(t.current_stop??origStop);
    let mfe=Number(t.mfe_r??0),mae=Number(t.mae_r??0);
    let partialAt=t.partial_2r_at,targetAt=t.target_3r_at,stopAt=t.stop_hit_at;
    let status:"OPEN"|"TP2"|"TP3"|"STOP"|"CLOSED"=t.status;
    let closedAt:string|null=null;
    let realizedR:number|null=null;
    let realizedUsd:number|null=null;
    let event:string|null=null;

    for(const c of candles){
      mfe=Math.max(mfe,favorableR(t,c));
      mae=Math.min(mae,adverseR(t,c));
    }

    const entrySeen=observedAt;
    const managementStart=status==="TP2"&&partialAt?Math.max(entrySeen,Date.parse(partialAt)):entrySeen;
    for(const c of candles.filter((x:Minute)=>x.time>=managementStart)){
      const stop=hitStop(t,c,currentStop);
      const hit2=!partialAt&&hitTarget(t,c,Number(t.target_2r));
      const hit3=hitTarget(t,c,Number(t.target_3r));

      if(status==="OPEN"){
        if(stop && (hit2||hit3)){
          stopAt=new Date(c.time).toISOString(); status="STOP"; event="STOP";
          realizedR=-1; realizedUsd=-Number(t.estimated_risk_usd_001); closedAt=stopAt; break;
        }
        if(stop){
          stopAt=new Date(c.time).toISOString(); status="STOP"; event="STOP";
          realizedR=-1; realizedUsd=-Number(t.estimated_risk_usd_001); closedAt=stopAt; break;
        }
        if(hit3){
          if(!partialAt)partialAt=new Date(c.time).toISOString();
          targetAt=new Date(c.time).toISOString(); status="TP3"; event="TP3";
          realizedR=2.7; realizedUsd=Number(t.estimated_risk_usd_001)*2.7; closedAt=targetAt; break;
        }
        if(hit2){
          partialAt=new Date(c.time).toISOString(); status="TP2"; event="TP2";
        }
      }else if(status==="TP2"){
        if(stop && hit3){
          stopAt=new Date(c.time).toISOString(); status="CLOSED"; event="STOP_APOS_TP2";
          realizedR=0.6 + 0.7*rAt(t,currentStop); realizedUsd=Number(t.estimated_risk_usd_001)*realizedR; closedAt=stopAt; break;
        }
        if(stop){
          stopAt=new Date(c.time).toISOString(); status="CLOSED"; event="STOP_APOS_TP2";
          realizedR=0.6 + 0.7*rAt(t,currentStop); realizedUsd=Number(t.estimated_risk_usd_001)*realizedR; closedAt=stopAt; break;
        }
        if(hit3){
          targetAt=new Date(c.time).toISOString(); status="TP3"; event="TP3";
          realizedR=2.7; realizedUsd=Number(t.estimated_risk_usd_001)*2.7; closedAt=targetAt; break;
        }
      }
    }

    const currentR=rAt(t,snapshot.price);
    let ai:any=null;
    if(status==="OPEN"||status==="TP2"){
      const ctx:AiTradeContext={
        symbol:"XAUUSD",side:t.side,entry,originalStop:origStop,currentStop,
        target1:Number(t.target_2r),target2:Number(t.target_3r),currentPrice:snapshot.price,lot:0.01,
        unrealizedR:currentR,mfeR:mfe,maeR:mae,
        setupName:Array.isArray(t.engines)?t.engines.join(" + "):"FINAL_V1",
        reasons:Array.isArray(t.thesis)?t.thesis:[],
        market:{bias:snapshot.bias,regime:snapshot.regime,structure:snapshot.structure,factors:snapshot.factors}
      };
      ai=await manageTradeWithAi(ctx);
      if(ai.suggestedStop!=null){
        currentStop=t.side==="LONG"?Math.max(currentStop,ai.suggestedStop):Math.min(currentStop,ai.suggestedStop);
      }
    }

    const now=new Date().toISOString();
    await updateShadowTrade(t.id,{
      status,current_price:snapshot.price,current_stop:currentStop,mfe_r:+mfe.toFixed(3),mae_r:+mae.toFixed(3),
      realized_r:realizedR,realized_usd:realizedUsd,ai_state:ai,
      partial_2r_at:partialAt,target_3r_at:targetAt,stop_hit_at:stopAt,
      last_ai_action:ai?.action??t.last_ai_action,last_ai_message:ai?.reason??t.last_ai_message,last_ai_at:ai?now:t.last_ai_at,
      closed_at:closedAt
    });
    results.push({id:t.id,status,event,currentPrice:snapshot.price,currentR:+currentR.toFixed(3),mfeR:+mfe.toFixed(3),maeR:+mae.toFixed(3),currentStop,ai,previousAiAction:t.last_ai_action,lastTelegramEvent:t.last_telegram_event});
  }
  return results;
}
