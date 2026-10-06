import type { MarketSnapshot } from "@/lib/market";
import { getHistoricalPrices, getLiveQuote, resolveGoldEpic } from "@/lib/capital";
import { evaluateLatestIndependentSignal, type Diag, type Engine } from "@/lib/independent-engine-research";

type Tagged = Diag & { engines: Engine[] };

export type TradeThesisDna = {
  version: "FINAL_V1";
  signalClass: "PREMIUM" | "PREMIUM+";
  engines: Engine[];
  side: "LONG" | "SHORT";
  score: number;
  signalTime: string;
  observedAt: string;
  modelEntry: number;
  entry: number;
  originalStop: number;
  riskPoints: number;
  riskPercent: number;
  estimatedRiskUsd001: number;
  target2R: number;
  target3R: number;
  confirmations: {
    bos: boolean;
    displacement: boolean;
    m1: true;
    h1Aligned: boolean;
    m15Aligned: boolean;
    orderBlock: boolean;
    fvg: boolean;
    fibonacci: boolean;
    liquiditySweep: boolean;
    majorLiquiditySweep: boolean;
  };
  thesis: string[];
  invalidation: string;
};

export type LiveFinalSnapshot = MarketSnapshot & {
  source: "Capital.com";
  epic: string;
  marketStatus?: string;
  engineVersion: "FINAL_V1";
  finalGate: string;
  activeEngines: Array<{ engine: Engine; score: number; side: "LONG" | "SHORT"; accepted: boolean; reason: string }>;
  marketMap: {
    support: Array<{price:number;strength:"MÉDIO"|"FORTE";score:number;touches:number;distancePct:number;lastTouch:string}>;
    resistance: Array<{price:number;strength:"MÉDIO"|"FORTE";score:number;touches:number;distancePct:number;lastTouch:string}>;
    interestZones: Array<{type:"DEMANDA"|"OFERTA";low:number;high:number;center:number;strength:"MÉDIO"|"FORTE";score:number;distancePct:number;reason:string}>;
    volatility: {avgM5Range:number;zoneWidth:number};
  };
  dna: TradeThesisDna | null;
  execution: "MANUAL_ONLY";
};

const engineLabels: Record<Engine,string> = {
  LIQUIDITY_REVERSAL: "Reversão de Liquidez",
  INSTITUTIONAL_PULLBACK: "Retração Institucional",
  LIQUIDITY_CONTINUATION: "Continuação de Liquidez"
};

function eligible(engine:Engine,c:Diag){
  if(engine==="LIQUIDITY_REVERSAL") return true;
  return c.features.h1Aligned&&c.features.m15Aligned&&c.features.bos&&c.features.disp;
}

function target(side:"LONG"|"SHORT",entry:number,risk:number,r:number){
  return side==="LONG"?entry+risk*r:entry-risk*r;
}

function reasons(c:Tagged){
  const r:string[]=[];
  if(c.features.bos)r.push("BOS confirmado");
  if(c.features.disp)r.push("deslocamento confirmado");
  if(c.features.h1Aligned)r.push("H1 alinhado");
  if(c.features.m15Aligned)r.push("M15 alinhado");
  if(c.features.ob)r.push("Order Block validado");
  if(c.features.fvg)r.push("FVG ativo");
  if(c.features.fib)r.push("Fibonacci em confluência");
  if(c.features.sweep||c.majorSweep)r.push("captura de liquidez");
  if(c.engines.length>1)r.push(`concordância de ${c.engines.length} motores`);
  return r;
}

function mergeCurrent(candidates:Array<{engine:Engine;c:Diag}>){
  const groups:Tagged[]=[];
  for(const x of candidates){
    const found=groups.find(g=>g.side===x.c.side&&Math.abs(g.time-x.c.time)<=15*60_000&&Math.abs(g.entry-x.c.entry)<=Math.max(g.risk,x.c.risk)*.5);
    if(found){
      if(!found.engines.includes(x.engine))found.engines.push(x.engine);
      if(x.c.score>found.score)Object.assign(found,{...x.c,engines:found.engines});
    }else groups.push({...x.c,engines:[x.engine]});
  }
  return groups;
}

type MapCandle={time:number;high:number;low:number;close:number};
function mapMid(v:any){
  const bid=Number(v?.bid),ask=Number(v?.ask??v?.offer);
  if(Number.isFinite(bid)&&Number.isFinite(ask))return(bid+ask)/2;
  if(Number.isFinite(bid))return bid;
  if(Number.isFinite(ask))return ask;
  return NaN;
}
function mapCandle(raw:any):MapCandle|null{
  const time=Date.parse(raw?.snapshotTimeUTC||raw?.snapshotTime||raw?.time||"");
  const high=mapMid(raw?.highPrice),low=mapMid(raw?.lowPrice),close=mapMid(raw?.closePrice);
  return Number.isFinite(time)&&Number.isFinite(high)&&Number.isFinite(low)&&Number.isFinite(close)?{time,high,low,close}:null;
}
function buildMarketMap(raw:any[],price:number){
  const candles=raw.map(mapCandle).filter((x):x is MapCandle=>!!x).slice(-360);
  const ranges=candles.slice(-60).map(c=>c.high-c.low).filter(x=>x>0);
  const avgRange=ranges.length?ranges.reduce((a,b)=>a+b,0)/ranges.length:price*.001;
  const tolerance=Math.max(price*.00045,avgRange*.35);
  const pivots:Array<{price:number;time:number;kind:"H"|"L"}>=[];
  for(let i=2;i<candles.length-2;i++){
    const c=candles[i];
    const hi=c.high>=candles[i-1].high&&c.high>=candles[i-2].high&&c.high>=candles[i+1].high&&c.high>=candles[i+2].high;
    const lo=c.low<=candles[i-1].low&&c.low<=candles[i-2].low&&c.low<=candles[i+1].low&&c.low<=candles[i+2].low;
    if(hi)pivots.push({price:c.high,time:c.time,kind:"H"});
    if(lo)pivots.push({price:c.low,time:c.time,kind:"L"});
  }
  const clusters:Array<{price:number;times:number[];kinds:Set<string>}>=[];
  for(const p of pivots){
    const found=clusters.find(x=>Math.abs(x.price-p.price)<=tolerance);
    if(found){
      const n=found.times.length;
      found.price=(found.price*n+p.price)/(n+1);
      found.times.push(p.time);found.kinds.add(p.kind);
    }else clusters.push({price:p.price,times:[p.time],kinds:new Set([p.kind])});
  }
  const now=Date.now();
  const scored=clusters.map(x=>{
    const last=Math.max(...x.times);
    const ageH=Math.max(0,(now-last)/3600000);
    const recency=Math.max(0,30-Math.min(30,ageH*.7));
    const touches=x.times.length;
    const mixed=x.kinds.size>1?8:0;
    const score=Math.min(100,Math.round(touches*18+recency+mixed));
    const strength: "MÉDIO"|"FORTE"|null = score>=65?"FORTE":score>=40?"MÉDIO":null;
    return {price:x.price,score,strength,touches,lastTouch:new Date(last).toISOString(),distancePct:Math.abs(x.price-price)/price*100};
  }).filter(x=>x.strength!==null);
  const support=scored.filter(x=>x.price<price).sort((a,b)=>a.distancePct-b.distancePct).slice(0,3) as Array<{price:number;score:number;strength:"MÉDIO"|"FORTE";touches:number;lastTouch:string;distancePct:number}>;
  const resistance=scored.filter(x=>x.price>price).sort((a,b)=>a.distancePct-b.distancePct).slice(0,3) as Array<{price:number;score:number;strength:"MÉDIO"|"FORTE";touches:number;lastTouch:string;distancePct:number}>;
  const zoneWidth=Math.max(tolerance*.75,avgRange*.22);
  const chosen=[...support.slice(0,2).map(x=>({...x,type:"DEMANDA" as const})),...resistance.slice(0,2).map(x=>({...x,type:"OFERTA" as const}))];
  const interestZones=chosen.map(x=>({
    type:x.type,low:+(x.price-zoneWidth).toFixed(2),high:+(x.price+zoneWidth).toFixed(2),center:+x.price.toFixed(2),
    strength:x.strength,score:x.score,distancePct:+x.distancePct.toFixed(3),
    reason:`${x.touches} testes de swing · último toque ${Math.max(0,((now-Date.parse(x.lastTouch))/3600000)).toFixed(1)}h atrás`
  })).sort((a,b)=>a.distancePct-b.distancePct);
  return {
    support:support.map(x=>({...x,price:+x.price.toFixed(2),distancePct:+x.distancePct.toFixed(3)})),
    resistance:resistance.map(x=>({...x,price:+x.price.toFixed(2),distancePct:+x.distancePct.toFixed(3)})),
    interestZones,
    volatility:{avgM5Range:+avgRange.toFixed(2),zoneWidth:+zoneWidth.toFixed(2)}
  };
}

export async function getLiveFinalSnapshot():Promise<LiveFinalSnapshot>{
  const epic=await resolveGoldEpic();
  const now=new Date();
  const from5=new Date(now.getTime()-72*3600_000);
  const from1=new Date(now.getTime()-3*3600_000);
  const [raw5,raw1,quote]=await Promise.all([
    getHistoricalPrices(epic,"MINUTE_5",from5,now,1000),
    getHistoricalPrices(epic,"MINUTE",from1,now,300),
    getLiveQuote()
  ]);

  const specs:{engine:Engine;threshold:number}[]=[
    {engine:"LIQUIDITY_REVERSAL",threshold:68},
    {engine:"INSTITUTIONAL_PULLBACK",threshold:64},
    {engine:"LIQUIDITY_CONTINUATION",threshold:64}
  ];
  const marketMap=buildMarketMap(raw5,quote.price);
  const evaluated=specs.map(s=>({s,c:evaluateLatestIndependentSignal(raw5,raw1,s.engine,s.threshold,now.getTime())}));
  const acceptedBase=evaluated.filter((x):x is {s:{engine:Engine;threshold:number};c:Diag}=>!!x.c&&eligible(x.s.engine,x.c));
  const merged=mergeCurrent(acceptedBase.map(x=>({engine:x.s.engine,c:x.c})));
  const passed=merged.filter(c=>(c.features.bos||c.engines.length>1)&&c.features.riskPct<=.0035);
  const sides=new Set(passed.map(c=>c.side));
  const selected=sides.size===1?[...passed].sort((a,b)=>(b.engines.length-a.engines.length)||(b.score-a.score))[0]:null;

  const activeEngines=evaluated.map(({s,c})=>{
    if(!c)return{engine:s.engine,score:0,side:"LONG" as const,accepted:false,reason:"sem setup válido no último M5 fechado"};
    const base=eligible(s.engine,c);
    const group=merged.find(g=>g.side===c.side&&Math.abs(g.time-c.time)<=15*60_000&&Math.abs(g.entry-c.entry)<=Math.max(g.risk,c.risk)*.5);
    const final=base&&!!group&&(group.features.bos||group.engines.length>1)&&group.features.riskPct<=.0035;
    const why=!base?"faltou alinhamento/BOS/deslocamento obrigatório":group&&group.features.riskPct>.0035?"risco estrutural acima de 0,35%":group&&!group.features.bos&&group.engines.length<2?"faltou BOS ou concordância multimotor":final?"aprovado pelo FINAL_V1":"não aprovado";
    return{engine:s.engine,score:c.score,side:c.side,accepted:final,reason:why};
  });

  if(!selected){
    const conflict=sides.size>1;
    return{
      symbol:"XAUUSD",price:quote.price,changePercent:quote.changePercent,bias:"WAIT",confidence:conflict?35:50,
      session:"Mercado global",regime:"TRANSITION",
      structure:conflict?"Motores produziram direções conflitantes; o FINAL_V1 aguarda resolução.":"Nenhuma oportunidade passou agora pelo portão FINAL_V1: BOS ou concordância multimotor + risco estrutural ≤0,35%.",
      setup:{entryZone:[quote.price,quote.price],stop:quote.price,target1:quote.price,target2:quote.price,rr:0},
      factors:activeEngines.map(x=>({label:engineLabels[x.engine],score:x.score,note:x.reason})),
      updatedAt:new Date().toISOString(),source:"Capital.com",epic,marketStatus:quote.marketStatus,
      engineVersion:"FINAL_V1",finalGate:"BOS OU 2+ motores; risco estrutural ≤ 0,35%; timing ao vivo ≤ 0,25R",activeEngines,marketMap,dna:null,execution:"MANUAL_ONLY"
    };
  }

  const deviationR=Math.abs(quote.price-selected.entry)/Math.max(selected.risk,0.0001);
  const stopValid=selected.side==="LONG"?quote.price>selected.stop:quote.price<selected.stop;
  const liveRisk=Math.abs(quote.price-selected.stop);
  const liveRiskPct=liveRisk/quote.price;
  if(!stopValid||deviationR>0.25||liveRiskPct>0.0035){
    const reason=!stopValid
      ?"Preço atual já atravessou a invalidação estrutural."
      :deviationR>0.25
        ?`Setup válido, mas preço atual afastou ${deviationR.toFixed(2)}R da entrada estrutural; não perseguir preço.`
        :"Risco estrutural ao preço atual excede 0,35%.";
    return{
      symbol:"XAUUSD",price:quote.price,changePercent:quote.changePercent,bias:"WAIT",confidence:45,
      session:"Mercado global",regime:"TRANSITION",
      structure:reason,
      setup:{entryZone:[quote.price,quote.price],stop:selected.stop,target1:quote.price,target2:quote.price,rr:0},
      factors:activeEngines.map(x=>({label:engineLabels[x.engine],score:x.score,note:x.reason})),
      updatedAt:new Date().toISOString(),source:"Capital.com",epic,marketStatus:quote.marketStatus,
      engineVersion:"FINAL_V1",finalGate:"BOS OU 2+ motores; risco estrutural ≤ 0,35%; timing ao vivo ≤ 0,25R",activeEngines,marketMap,dna:null,execution:"MANUAL_ONLY"
    };
  }

  const liveEntry=quote.price;
  const rs=reasons(selected),t2=target(selected.side,liveEntry,liveRisk,2),t3=target(selected.side,liveEntry,liveRisk,3);
  const signalClass: "PREMIUM"|"PREMIUM+" = selected.engines.length>1||selected.score>=80?"PREMIUM+":"PREMIUM";
  const dna:TradeThesisDna={
    version:"FINAL_V1",signalClass,engines:selected.engines,side:selected.side,score:selected.score,
    signalTime:new Date(selected.time).toISOString(),observedAt:new Date().toISOString(),modelEntry:+selected.entry.toFixed(2),
    entry:+liveEntry.toFixed(2),originalStop:+selected.stop.toFixed(2),
    riskPoints:+liveRisk.toFixed(2),riskPercent:+(liveRiskPct*100).toFixed(3),
    estimatedRiskUsd001:+liveRisk.toFixed(2),target2R:+t2.toFixed(2),target3R:+t3.toFixed(2),
    confirmations:{bos:selected.features.bos,displacement:selected.features.disp,m1:true,h1Aligned:selected.features.h1Aligned,m15Aligned:selected.features.m15Aligned,orderBlock:selected.features.ob,fvg:selected.features.fvg,fibonacci:selected.features.fib,liquiditySweep:selected.features.sweep,majorLiquiditySweep:selected.majorSweep},
    thesis:[...rs,`timing ao vivo: desvio ${deviationR.toFixed(2)}R`],
    invalidation:`Fechamento/continuidade além do stop estrutural ${selected.stop.toFixed(2)} ou quebra objetiva da tese monitorada pela IA.`
  };
  const confidence=Math.min(95,Math.round(55+Math.min(25,(selected.score-68)*1.2)+(selected.engines.length>1?10:0)+(selected.features.bos&&selected.features.disp?8:0)));
  return{
    symbol:"XAUUSD",price:quote.price,changePercent:quote.changePercent,bias:selected.side,confidence,
    session:"Mercado global",regime:selected.engines.includes("LIQUIDITY_REVERSAL")&&selected.engines.length===1?"TRANSITION":"TREND",
    structure:`${signalClass} · ${selected.engines.map(e=>engineLabels[e]).join(" + ")} · ${rs.join(" · ")}.`,
    setup:{entryZone:[+selected.entry.toFixed(2),+selected.entry.toFixed(2)],stop:+selected.stop.toFixed(2),target1:+t2.toFixed(2),target2:+t3.toFixed(2),rr:3},
    factors:activeEngines.map(x=>({label:engineLabels[x.engine],score:x.score,note:x.reason})),
    updatedAt:new Date().toISOString(),source:"Capital.com",epic,marketStatus:quote.marketStatus,
    engineVersion:"FINAL_V1",finalGate:"BOS OU 2+ motores; risco estrutural ≤ 0,35%",activeEngines,marketMap,dna,execution:"MANUAL_ONLY"
  };
}
