import {C,T,atr,blockMetrics,buildLevels,inWindow,metrics,prep,push,day} from "@/lib/alpha2-lab-core";
type P={family:string;id:string;params:any;trades:T[]};
type Win="LONDON"|"NY"|"BOTH";
function sess(t:number,w:Win){const d=new Date(t),m=d.getUTCHours()*60+d.getUTCMinutes(),lon=m>=360&&m<=630,ny=m>=720&&m<=990;return w==="LONDON"?lon:w==="NY"?ny:lon||ny}

function sweep(a:C[],p:any){
  const out:T[]=[],lv=buildLevels(a);let lock=0;
  for(let i=60;i<a.length-40;i++){const c=a[i];if(!inWindow(c.time)||!sess(c.time,p.window)||c.time<lock)continue;const av=atr(a,i-1),d=day(c.time),pd=lv.pd.get(d),as=lv.asia.get(d);if(!av)continue;
    const levels:number[]=[];if((p.source==="PD"||p.source==="BOTH")&&pd)levels.push(pd.lo,pd.hi);const mins=new Date(c.time).getUTCHours()*60+new Date(c.time).getUTCMinutes();if((p.source==="ASIA"||p.source==="BOTH")&&as&&mins>=360)levels.push(as.lo,as.hi);
    let side:"LONG"|"SHORT"|null=null,ref=NaN;
    for(const l of levels){const r=c.high-c.low||1;if(c.low<l&&c.close>l&&(Math.min(c.open,c.close)-c.low)/r>=p.wick){side="LONG";ref=l;break}if(c.high>l&&c.close<l&&(c.high-Math.max(c.open,c.close))/r>=p.wick){side="SHORT";ref=l;break}}
    if(!side)continue;
    const j=Math.max(0,i-p.trend),mom=a[i-1].close-a[j].close;if(side==="LONG"&&mom<0||side==="SHORT"&&mom>0)continue;
    const stop=side==="LONG"?Math.min(c.low,ref-av*.1):Math.max(c.high,ref+av*.1);if(push(out,a,i,side,stop,p.target,30,"SESSION_SWEEP"))lock=out[out.length-1].exitTime+10*60000;
  }return out;
}
function fvg(a:C[],p:any){
  const out:T[]=[],zones:{side:"LONG"|"SHORT";lo:number;hi:number;i:number}[]=[];let lock=0;
  for(let i=2;i<a.length-40;i++){const av=atr(a,i-1);if(!av)continue;const m=a[i-1],disp=Math.abs(m.close-m.open);if(a[i-2].high<a[i].low&&disp>=av*p.disp)zones.push({side:"LONG",lo:a[i-2].high,hi:a[i].low,i});if(a[i-2].low>a[i].high&&disp>=av*p.disp)zones.push({side:"SHORT",lo:a[i].high,hi:a[i-2].low,i});
    if(!inWindow(a[i].time)||!sess(a[i].time,p.window)||a[i].time<lock)continue;
    for(let z=zones.length-1;z>=0;z--){const q=zones[z];if(i-q.i<1)continue;if(i-q.i>p.age)break;const c=a[i];if(!(c.low<=q.hi&&c.high>=q.lo))continue;const j=Math.max(0,i-p.trend),mom=a[i-1].close-a[j].close;if(q.side==="LONG"&&mom<=0||q.side==="SHORT"&&mom>=0)continue;const zm=(q.lo+q.hi)/2,ok=q.side==="LONG"?c.close>zm&&c.close>c.open:c.close<zm&&c.close<c.open;if(!ok)continue;const stop=q.side==="LONG"?q.lo-av*.15:q.hi+av*.15;if(push(out,a,i,q.side,stop,p.target,36,"FVG_RETEST")){lock=out[out.length-1].exitTime+10*60000;break}}
  }return out;
}
function retest(a:C[],p:any){
  const out:T[]=[];let lock=0;
  for(let i=Math.max(50,p.lookback+5);i<a.length-40;i++){if(!inWindow(a[i].time)||!sess(a[i].time,p.window)||a[i].time<lock)continue;const av=atr(a,i-1);if(!av)continue;let done=false;
    for(let lag=1;lag<=p.retest&&!done;lag++){const bi=i-lag,b=a[bi],q=a.slice(bi-p.lookback,bi),hi=Math.max(...q.map(x=>x.high)),lo=Math.min(...q.map(x=>x.low)),range=b.high-b.low;if(range<av*p.expansion)continue;let side:"LONG"|"SHORT"|null=null,level=NaN;if(b.close>hi)side="LONG",level=hi;if(b.close<lo)side="SHORT",level=lo;if(!side)continue;const c=a[i],tol=av*.12,ok=side==="LONG"?c.low<=level+tol&&c.close>level&&c.close>c.open:c.high>=level-tol&&c.close<level&&c.close<c.open;if(!ok)continue;const j=Math.max(0,bi-p.trend),mom=a[bi-1].close-a[j].close;if(side==="LONG"&&mom<=0||side==="SHORT"&&mom>=0)continue;const stop=side==="LONG"?Math.min(c.low,level-av*.6):Math.max(c.high,level+av*.6);if(push(out,a,i,side,stop,p.target,30,"EXPANSION_RETEST")){lock=out[out.length-1].exitTime+10*60000;done=true}}
  }return out;
}
function evalOne(c:P,start:number,trainEnd:number,end:number){
  const train=c.trades.filter(x=>x.time<trainEnd),tm=metrics(train,(trainEnd-start)/86400000),tb=blockMetrics(train,start,trainEnd,3),posTrain=tb.filter(x=>x.netR>0).length,minTrain=Math.min(...tb.map(x=>x.trades)),minTrainR=Math.min(...tb.map(x=>x.netR));
  const fw=c.trades.filter(x=>x.time>=trainEnd),fm=metrics(fw,(end-trainEnd)/86400000),fb=blockMetrics(fw,trainEnd,end,3),posForward=fb.filter(x=>x.netR>0).length,minForward=Math.min(...fb.map(x=>x.trades));
  const score=posTrain*12+tm.avgR*45+Math.min(3,tm.profitFactor)*3+Math.min(2,tm.tradesPerDay)*5-tm.maxDrawdownR*1.35+(minTrainR>0?8:0);
  const trainPass=tm.trades>=18&&posTrain>=2&&tm.avgR>.03&&tm.profitFactor>1.05&&tm.maxDrawdownR<=8&&minTrain>=3;
  const forwardPass=fm.trades>=15&&posForward>=2&&fm.avgR>.03&&fm.profitFactor>1.05&&fm.maxDrawdownR<=8&&minForward>=3;
  return{id:c.id,family:c.family,params:c.params,score:+score.toFixed(2),train:tm,trainBlocks:tb,positiveTrainBlocks:posTrain,trainPass,forward:fm,forwardBlocks:fb,positiveForwardBlocks:posForward,forwardPass};
}
export function runAlpha2Lab(raw:any[]){
  const a=prep(raw);if(a.length<1000)return{status:"insufficient_data",candles:a.length};const start=a[0].time,end=a[a.length-1].time,trainEnd=start+(end-start)/2,cands:P[]=[];
  for(const source of ["PD","ASIA","BOTH"])for(const wick of [.25,.4])for(const trend of [24,48])for(const target of [1.2,1.5,1.8])for(const window of ["LONDON","NY","BOTH"] as Win[]){const params={source,wick,trend,target,window};cands.push({family:"SESSION_SWEEP",id:`SW-${source}-${wick}-${trend}-${target}-${window}`,params,trades:sweep(a,params)})}
  for(const disp of [.8,1.1])for(const age of [8,16])for(const trend of [24,48])for(const target of [1.2,1.5,1.8])for(const window of ["LONDON","NY","BOTH"] as Win[]){const params={disp,age,trend,target,window};cands.push({family:"FVG_RETEST",id:`FVG-${disp}-${age}-${trend}-${target}-${window}`,params,trades:fvg(a,params)})}
  for(const lookback of [12,18,24])for(const expansion of [1,1.25])for(const retestBars of [2,4])for(const trend of [24,48])for(const target of [1.2,1.5])for(const window of ["LONDON","NY","BOTH"] as Win[]){const params={lookback,expansion,retest:retestBars,trend,target,window};cands.push({family:"EXPANSION_RETEST",id:`ER-${lookback}-${expansion}-${retestBars}-${trend}-${target}-${window}`,params,trades:retest(a,params)})}
  const ranked=cands.map(x=>evalOne(x,start,trainEnd,end)).sort((x,y)=>y.score-x.score),qualified=ranked.filter(x=>x.trainPass),validated=qualified.filter(x=>x.forwardPass),proposed=qualified.find(x=>x.forwardPass)??null;
  const byFamily=["SESSION_SWEEP","FVG_RETEST","EXPANSION_RETEST"].map(f=>({family:f,topTraining:ranked.filter(x=>x.family===f).slice(0,5),validated:validated.filter(x=>x.family===f).slice(0,5)}));
  return{status:"ok",candles:a.length,from:new Date(start).toISOString(),trainUntil:new Date(trainEnd).toISOString(),to:new Date(end).toISOString(),validation:"Primeira metade (~90d) usada para seleção. Segunda metade dividida em 3 blocos futuros; exige pelo menos 2/3 positivos.",costStress:"0.50 ponto XAUUSD por trade",variantsTested:ranked.length,trainQualified:qualified.length,forwardValidated:validated.length,proposed,validated:validated.slice(0,12),byFamily,warning:"O bloco mais recente já foi observado em rodada anterior; esta rodada multi-fold reduz, mas não elimina, risco de overfit. Forward LIVE ainda é obrigatório."};
}
