import { buildIndependentCandidates, type Diag, type Engine } from "@/lib/independent-engine-research";
import { simulate } from "@/lib/exit-policy-research";

type Tagged=Diag&{engines:Engine[]};
type Row={c:Tagged;r:number;usd:number;riskPct:number;hourBr:number;fullStop:boolean};

function eligible(engine:Engine,c:Diag){
  if(engine==="LIQUIDITY_REVERSAL") return true;
  return c.features.h1Aligned&&c.features.m15Aligned&&c.features.bos&&c.features.disp;
}

function equivalent(a:Tagged,b:Tagged){
  if(a.side!==b.side)return false;
  if(Math.abs(a.time-b.time)>15*60_000)return false;
  const tol=Math.max(a.risk,b.risk)*0.5;
  return Math.abs(a.entry-b.entry)<=tol;
}

function mergeCandidates(raw5:any[],raw1:any[]){
  const specs:{engine:Engine;threshold:number}[]=[
    {engine:"LIQUIDITY_REVERSAL",threshold:68},
    {engine:"INSTITUTIONAL_PULLBACK",threshold:64},
    {engine:"LIQUIDITY_CONTINUATION",threshold:64}
  ];
  const source:any={};
  const all:Tagged[]=[];
  for(const s of specs){
    const cs=buildIndependentCandidates(raw5,raw1,s.engine,s.threshold).filter(c=>eligible(s.engine,c));
    source[s.engine]=cs.length;
    for(const c of cs)all.push({...c,engines:[s.engine]});
  }
  all.sort((a,b)=>a.time-b.time);
  const unique:Tagged[]=[];
  let duplicatesRemoved=0;
  for(const c of all){
    let dup:Tagged|undefined;
    for(let i=unique.length-1;i>=0;i--){
      const u=unique[i];
      if(c.time-u.time>15*60_000)break;
      if(equivalent(c,u)){dup=u;break}
    }
    if(dup){
      duplicatesRemoved++;
      for(const e of c.engines)if(!dup.engines.includes(e))dup.engines.push(e);
      continue;
    }
    unique.push(c);
  }
  return{unique,source,rawSignals:all.length,duplicatesRemoved};
}

function makeRows(cs:Tagged[]):Row[]{return cs.map(c=>{const r=simulate(c,"RUNNER_3R" as any),riskUsd=Math.abs(c.entry-c.stop),usd=r*riskUsd,d=new Date(c.time-3*3600000);return{c,r,usd,riskPct:c.risk/c.entry,hourBr:d.getUTCHours(),fullStop:r<=-.999}})}
function stats(cs:Tagged[]){
  const rr=makeRows(cs);
  const rows=rr.map(x=>({time:x.c.time,r:x.r,usd:x.usd,side:x.c.side,engines:x.c.engines,riskUsd:Math.abs(x.c.entry-x.c.stop),score:x.c.score}));
  const trades=rows.length,totalR=rows.reduce((s,x)=>s+x.r,0),totalUsd=rows.reduce((s,x)=>s+x.usd,0);
  const wins=rows.filter(x=>x.r>0).length,losses=rows.filter(x=>x.r<0).length,stops=rows.filter(x=>x.r<=-.999).length;
  let eq=0,peak=0,dd=0;
  for(const x of rows){eq+=x.r;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq)}
  const multi=rows.filter(x=>x.engines.length>1);
  const single=rows.filter(x=>x.engines.length===1);
  const byEngine:any={};
  for(const e of ["LIQUIDITY_REVERSAL","INSTITUTIONAL_PULLBACK","LIQUIDITY_CONTINUATION"] as Engine[]){
    const xs=rows.filter(x=>x.engines.includes(e));
    byEngine[e]={trades:xs.length,totalUsd:+xs.reduce((s,x)=>s+x.usd,0).toFixed(2),totalR:+xs.reduce((s,x)=>s+x.r,0).toFixed(2)};
  }
  return{
    trades,totalR:+totalR.toFixed(2),avgR:+(totalR/Math.max(1,trades)).toFixed(3),
    totalUsd:+totalUsd.toFixed(2),avgUsd:+(totalUsd/Math.max(1,trades)).toFixed(2),
    winRate:+(wins/Math.max(1,trades)*100).toFixed(1),lossRate:+(losses/Math.max(1,trades)*100).toFixed(1),
    fullStopRate:+(stops/Math.max(1,trades)*100).toFixed(1),maxDrawdownR:+dd.toFixed(2),
    multiEngineTrades:multi.length,singleEngineTrades:single.length,byEngine
  };
}


function mini(rows:Row[]){
  const trades=rows.length,totalUsd=rows.reduce((s,x)=>s+x.usd,0),totalR=rows.reduce((s,x)=>s+x.r,0),wins=rows.filter(x=>x.r>0).length,stops=rows.filter(x=>x.fullStop).length;
  return{trades,totalUsd:+totalUsd.toFixed(2),avgUsd:+(totalUsd/Math.max(1,trades)).toFixed(2),totalR:+totalR.toFixed(2),winRate:+(wins/Math.max(1,trades)*100).toFixed(1),fullStopRate:+(stops/Math.max(1,trades)*100).toFixed(1)};
}
function diagnostics(cs:Tagged[]){
  const rows=makeRows(cs);
  const byHour:any={};for(let h=0;h<24;h++){const x=rows.filter(r=>r.hourBr===h);if(x.length)byHour[h]=mini(x)}
  const byRisk={
    ate02:mini(rows.filter(r=>r.riskPct<=.002)),
    de02a035:mini(rows.filter(r=>r.riskPct>.002&&r.riskPct<=.0035)),
    de035a05:mini(rows.filter(r=>r.riskPct>.0035))
  };
  const byAgreement={
    single:mini(rows.filter(r=>r.c.engines.length===1)),
    multi:mini(rows.filter(r=>r.c.engines.length>1))
  };
  const bySide={LONG:mini(rows.filter(r=>r.c.side==="LONG")),SHORT:mini(rows.filter(r=>r.c.side==="SHORT"))};
  const lrOnly=rows.filter(r=>r.c.engines.includes("LIQUIDITY_REVERSAL"));
  const lrScore={
    s68a71:mini(lrOnly.filter(r=>r.c.score>=68&&r.c.score<72)),
    s72a79:mini(lrOnly.filter(r=>r.c.score>=72&&r.c.score<80)),
    s80plus:mini(lrOnly.filter(r=>r.c.score>=80))
  };
  const features={
    bosDisp:mini(rows.filter(r=>r.c.features.bos&&r.c.features.disp)),
    noBos:mini(rows.filter(r=>!r.c.features.bos)),
    noDisp:mini(rows.filter(r=>!r.c.features.disp)),
    obOrFvg:mini(rows.filter(r=>r.c.features.ob||r.c.features.fvg)),
    fib:mini(rows.filter(r=>r.c.features.fib))
  };
  return{byHour,byRisk,byAgreement,bySide,lrScore,features};
}
function variant(cs:Tagged[],name:string,pred:(c:Tagged)=>boolean){const x=cs.filter(pred);return{name,...stats(x)}}

export function runMultiMotorPortfolioResearch(raw5:any[],raw1:any[]){
  const merged=mergeCandidates(raw5,raw1);
  const finalSignals=merged.unique.filter(c=>(c.features.bos||c.engines.length>1)&&c.risk/c.entry<=.0035);
  return{
    policy:{
      liquidityReversal:"score >= 68",
      institutionalPullback:"score >= 64 + H1/M15 alinhados + BOS + deslocamento",
      liquidityContinuation:"score >= 64 + H1/M15 alinhados + BOS + deslocamento",
      dailyLimit:"nenhum",
      dedupe:"mesma direção, até 15 min, entrada dentro de 0,5x do maior risco estrutural",
      exit:"30% em 2R + 70% buscando 3R",
      finalQualityGate:"BOS no setup OU concordância de 2+ motores; risco estrutural <= 0,35% do preço",
      status:"FINAL_V1"
    },
    sourceSignals:merged.source,
    rawSignals:merged.rawSignals,
    duplicatesRemoved:merged.duplicatesRemoved,
    uniqueSignalsBeforeFinalGate:merged.unique.length,
    finalSignals:finalSignals.length,
    metrics:stats(finalSignals),
    diagnostics:diagnostics(finalSignals),
    variants:[
      variant(finalSignals,"SEM_RISCO_035_05",c=>c.risk/c.entry<=.0035),
      variant(finalSignals,"SEM_HORAS_12_13_BR",c=>{const h=new Date(c.time-3*3600000).getUTCHours();return h!==12&&h!==13}),
      variant(finalSignals,"LR72_OU_MOTOR_CONFIRMADO",c=>!c.engines.includes("LIQUIDITY_REVERSAL")||c.score>=72||c.engines.length>1),
      variant(finalSignals,"EXIGE_BOS_OU_MULTI",c=>c.features.bos||c.engines.length>1),
      variant(finalSignals,"EXIGE_BOS_DISP_OU_LR72",c=>(c.features.bos&&c.features.disp)||(c.engines.includes("LIQUIDITY_REVERSAL")&&c.score>=72)),
      variant(finalSignals,"RISCO035_E_LR72_OU_MULTI",c=>c.risk/c.entry<=.0035&&(!c.engines.includes("LIQUIDITY_REVERSAL")||c.score>=72||c.engines.length>1)),
      variant(finalSignals,"BOS_OU_MULTI_E_RISCO035",c=>(c.features.bos||c.engines.length>1)&&c.risk/c.entry<=.0035),
      variant(finalSignals,"BOS_OU_MULTI_SEM_FIB",c=>(c.features.bos||c.engines.length>1)&&!c.features.fib)
    ]
  };
}
