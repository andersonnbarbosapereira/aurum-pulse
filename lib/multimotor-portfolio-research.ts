import { buildIndependentCandidates, type Diag, type Engine } from "@/lib/independent-engine-research";
import { simulate } from "@/lib/exit-policy-research";

type Tagged=Diag&{engines:Engine[]};

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

function stats(cs:Tagged[]){
  const rows=cs.map(c=>{
    const r=simulate(c,"RUNNER_3R" as any),riskUsd=Math.abs(c.entry-c.stop),usd=r*riskUsd;
    return{time:c.time,r,usd,side:c.side,engines:c.engines,riskUsd,score:c.score};
  });
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

export function runMultiMotorPortfolioResearch(raw5:any[],raw1:any[]){
  const merged=mergeCandidates(raw5,raw1);
  return{
    policy:{
      liquidityReversal:"score >= 68",
      institutionalPullback:"score >= 64 + H1/M15 alinhados + BOS + deslocamento",
      liquidityContinuation:"score >= 64 + H1/M15 alinhados + BOS + deslocamento",
      dailyLimit:"nenhum",
      dedupe:"mesma direção, até 15 min, entrada dentro de 0,5x do maior risco estrutural",
      exit:"30% em 2R + 70% buscando 3R"
    },
    sourceSignals:merged.source,
    rawSignals:merged.rawSignals,
    duplicatesRemoved:merged.duplicatesRemoved,
    uniqueSignals:merged.unique.length,
    metrics:stats(merged.unique)
  };
}
