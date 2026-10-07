import {C,T,atr,blockMetrics,inWindow,metrics,prep,push} from "@/lib/alpha2-lab-core";
type Win="ASIA"|"LONDON"|"NY"|"BOTH";type P={family:string;id:string;params:any;trades:T[]};
function sess(t:number,w:Win){const d=new Date(t),m=d.getUTCHours()*60+d.getUTCMinutes(),a=m>=0&&m<360,l=m>=360&&m<=630,n=m>=720&&m<=990;return w==="ASIA"?a:w==="LONDON"?l:w==="NY"?n:l||n}
function avg(a:C[],i:number,n:number){let s=0;for(let j=i-n;j<i;j++)s+=a[j].close;return s/n}
function rev(a:C[],p:any){
  const out:T[]=[];let lock=0;
  for(let i=Math.max(100,p.lookback+5);i<a.length-40;i++){const c=a[i];if(!inWindow(c.time)||!sess(c.time,p.window)||c.time<lock)continue;const av=atr(a,i-1,24),slow=atr(a,i-1,96);if(!av||!slow||av/slow>p.volMax)continue;
    const m=avg(a,i,p.lookback),trend=Math.abs(a[i-1].close-a[i-p.trendBars].close)/av;if(trend>p.trendMax)continue;const upper=m+av*p.band,lower=m-av*p.band,r=c.high-c.low||1;let side:"LONG"|"SHORT"|null=null;
    if(c.low<lower&&c.close>lower&&c.close>c.open&&(Math.min(c.open,c.close)-c.low)/r>.25)side="LONG";
    if(c.high>upper&&c.close<upper&&c.close<c.open&&(c.high-Math.max(c.open,c.close))/r>.25)side="SHORT";
    if(!side)continue;const entry=a[i+1].open,stop=side==="LONG"?c.low-av*.12:c.high+av*.12,risk=Math.abs(entry-stop),rr=Math.abs(m-entry)/risk;if(!Number.isFinite(rr)||rr<p.minRR||rr>2.8)continue;if(push(out,a,i,side,stop,rr,24,"REGIME_REVERSION"))lock=out[out.length-1].exitTime+10*60000;
  }return out;
}
function pull(a:C[],p:any){
  const out:T[]=[];let lock=0;
  for(let i=Math.max(100,p.trendBars+5);i<a.length-40;i++){const c=a[i];if(!inWindow(c.time)||!sess(c.time,p.window)||c.time<lock)continue;const av=atr(a,i-1,24);if(!av)continue;const diff=a[i-1].close-a[i-p.trendBars].close,str=Math.abs(diff)/av;if(str<p.trendMin)continue;const side:"LONG"|"SHORT"=diff>0?"LONG":"SHORT",m=avg(a,i,p.meanBars),r=c.high-c.low||1;
    const ok=side==="LONG"?c.low<=m+av*.18&&c.close>m&&c.close>c.open&&(c.close-c.low)/r>.62:c.high>=m-av*.18&&c.close<m&&c.close<c.open&&(c.high-c.close)/r>.62;if(!ok)continue;
    const swing=side==="LONG"?Math.min(...a.slice(i-3,i+1).map(x=>x.low)):Math.max(...a.slice(i-3,i+1).map(x=>x.high)),entry=a[i+1].open,atrStop=side==="LONG"?entry-av*.7:entry+av*.7,stop=side==="LONG"?Math.min(swing,atrStop):Math.max(swing,atrStop);if(push(out,a,i,side,stop,p.target,30,"TREND_PULLBACK"))lock=out[out.length-1].exitTime+10*60000;
  }return out;
}
function ev(c:P,start:number,trainEnd:number,end:number){
  const train=c.trades.filter(x=>x.time<trainEnd),fw=c.trades.filter(x=>x.time>=trainEnd),tm=metrics(train,(trainEnd-start)/86400000),fm=metrics(fw,(end-trainEnd)/86400000),tb=blockMetrics(train,start,trainEnd,3),fb=blockMetrics(fw,trainEnd,end,3),pt=tb.filter(x=>x.netR>0).length,pf=fb.filter(x=>x.netR>0).length,minT=Math.min(...tb.map(x=>x.trades)),minF=Math.min(...fb.map(x=>x.trades));
  const score=pt*12+tm.avgR*45+Math.min(3,tm.profitFactor)*3+Math.min(2,tm.tradesPerDay)*5-tm.maxDrawdownR*1.35;
  const trainPass=tm.trades>=18&&pt>=2&&tm.avgR>.03&&tm.profitFactor>1.05&&tm.maxDrawdownR<=8&&minT>=3,forwardPass=fm.trades>=15&&pf>=2&&fm.avgR>.03&&fm.profitFactor>1.05&&fm.maxDrawdownR<=8&&minF>=3;
  return{id:c.id,family:c.family,params:c.params,score:+score.toFixed(2),train:tm,trainBlocks:tb,positiveTrainBlocks:pt,trainPass,forward:fm,forwardBlocks:fb,positiveForwardBlocks:pf,forwardPass};
}

function adaptiveWalkForward(cands:P[],start:number,end:number){
  const step=(end-start)/6,folds:any[]=[],all:T[]=[];
  for(let k=3;k<6;k++){
    const trainStart=start+(k-3)*step,trainEnd=start+k*step,testEnd=start+(k+1)*step;
    const ranked=cands.map(x=>{
      const tr=x.trades.filter(t=>t.time>=trainStart&&t.time<trainEnd),m=metrics(tr,(trainEnd-trainStart)/86400000),b=blockMetrics(tr,trainStart,trainEnd,3),pos=b.filter(z=>z.netR>0).length,minTrades=Math.min(...b.map(z=>z.trades));
      const eligible=m.trades>=15&&m.avgR>.02&&m.profitFactor>1.04&&m.maxDrawdownR<=9&&pos>=2&&minTrades>=2;
      const score=pos*12+m.avgR*45+Math.min(3,m.profitFactor)*3+Math.min(2,m.tradesPerDay)*5-m.maxDrawdownR*1.25;
      return{x,m,b,pos,eligible,score};
    }).filter(x=>x.eligible).sort((a,b)=>b.score-a.score);
    const pick=ranked[0]??null;
    if(!pick){folds.push({trainStart:new Date(trainStart).toISOString(),testStart:new Date(trainEnd).toISOString(),testEnd:new Date(testEnd).toISOString(),selected:null});continue}
    const test=pick.x.trades.filter(t=>t.time>=trainEnd&&t.time<testEnd);all.push(...test);
    folds.push({trainStart:new Date(trainStart).toISOString(),testStart:new Date(trainEnd).toISOString(),testEnd:new Date(testEnd).toISOString(),selected:{id:pick.x.id,family:pick.x.family,params:pick.x.params,score:+pick.score.toFixed(2),train:pick.m},test:metrics(test,(testEnd-trainEnd)/86400000)});
  }
  all.sort((a,b)=>a.time-b.time);const agg=metrics(all,(end-(start+3*step))/86400000),positiveFolds=folds.filter(f=>f.test?.netR>0).length;
  return{folds,aggregate:agg,positiveFolds,pass:agg.trades>=15&&positiveFolds>=2&&agg.avgR>.03&&agg.profitFactor>1.05&&agg.maxDrawdownR<=8};
}

export function runAlpha2RegimeLab(raw:any[]){
  const a=prep(raw);if(a.length<1000)return{status:"insufficient_data",candles:a.length};const start=a[0].time,end=a[a.length-1].time,trainEnd=start+(end-start)/2,c:P[]=[];
  for(const lookback of [24,48])for(const band of [1,1.4,1.8])for(const trendMax of [1.5,2.5])for(const volMax of [1.15,1.45])for(const minRR of [1,1.2])for(const window of ["ASIA","LONDON","NY"] as Win[]){const p={lookback,band,trendBars:48,trendMax,volMax,minRR,window};c.push({family:"REGIME_REVERSION",id:`REV-${lookback}-${band}-${trendMax}-${volMax}-${minRR}-${window}`,params:p,trades:rev(a,p)})}
  for(const trendBars of [24,48])for(const trendMin of [1.5,2.5,3.5])for(const meanBars of [12,24])for(const target of [1.2,1.5,1.8])for(const window of ["LONDON","NY","BOTH"] as Win[]){const p={trendBars,trendMin,meanBars,target,window};c.push({family:"TREND_PULLBACK",id:`TP-${trendBars}-${trendMin}-${meanBars}-${target}-${window}`,params:p,trades:pull(a,p)})}
  const ranked=c.map(x=>ev(x,start,trainEnd,end)).sort((x,y)=>y.score-x.score),q=ranked.filter(x=>x.trainPass),v=q.filter(x=>x.forwardPass),proposed=q.find(x=>x.forwardPass)??null,byFamily=["REGIME_REVERSION","TREND_PULLBACK"].map(f=>({family:f,topTraining:ranked.filter(x=>x.family===f).slice(0,6),validated:v.filter(x=>x.family===f).slice(0,6)}));
  const adaptive=adaptiveWalkForward(c,start,end);
  const anchorIds=["TP-48-3.5-12-1.8-LONDON","REV-48-1-2.5-1.45-1-ASIA"];const anchors=anchorIds.map(id=>{const x=c.find(z=>z.id===id);if(!x)return null;const all=metrics(x.trades,(end-start)/86400000),blocks=blockMetrics(x.trades,start,end,6);return{id:x.id,family:x.family,params:x.params,all,blocks,positiveBlocks:blocks.filter(b=>b.netR>0).length}}).filter(Boolean);
  return{status:"ok",candles:a.length,from:new Date(start).toISOString(),trainUntil:new Date(trainEnd).toISOString(),to:new Date(end).toISOString(),validation:"~90d seleção + 3 blocos forward de ~30d; ranking usa somente treino.",costStress:"0.50 ponto XAUUSD por trade",variantsTested:ranked.length,trainQualified:q.length,forwardValidated:v.length,proposed,validated:v.slice(0,12),byFamily,adaptive,anchors,warning:"Laboratório exploratório; forward LIVE continua obrigatório."};
}
