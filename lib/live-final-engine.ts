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
      engineVersion:"FINAL_V1",finalGate:"BOS OU 2+ motores; risco estrutural ≤ 0,35%; timing ao vivo ≤ 0,25R",activeEngines,dna:null,execution:"MANUAL_ONLY"
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
      engineVersion:"FINAL_V1",finalGate:"BOS OU 2+ motores; risco estrutural ≤ 0,35%; timing ao vivo ≤ 0,25R",activeEngines,dna:null,execution:"MANUAL_ONLY"
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
    engineVersion:"FINAL_V1",finalGate:"BOS OU 2+ motores; risco estrutural ≤ 0,35%",activeEngines,dna,execution:"MANUAL_ONLY"
  };
}
