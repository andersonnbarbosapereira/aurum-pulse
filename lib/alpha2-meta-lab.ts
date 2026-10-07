import {C,T,atr,metrics,prep,simulate} from "@/lib/alpha2-lab-core";
type Family="PULLBACK"|"REVERSION";type Session="ASIA"|"LONDON"|"NY"|"OTHER";
type E=T&{family:Family;session:Session;trendStrength:number;volRatio:number;bucket:string};

function session(t:number):Session{const d=new Date(t),m=d.getUTCHours()*60+d.getUTCMinutes();if(m<360)return"ASIA";if(m<=630)return"LONDON";if(m>=720&&m<=990)return"NY";return"OTHER"}
function avg(a:C[],i:number,n:number){let s=0;for(let j=i-n;j<i;j++)s+=a[j].close;return s/n}
function tbin(v:number){return v<1.5?"T0":v<2.5?"T1":v<4?"T2":"T3"}
function vbin(v:number){return v<.9?"V0":v<1.1?"V1":v<1.35?"V2":"V3"}
function bucket(f:Family,s:Session,t:number,v:number){return f+"|"+s+"|"+tbin(t)+"|"+vbin(v)}
function add(out:E[],a:C[],i:number,side:"LONG"|"SHORT",stop:number,targetR:number,family:Family,ts:number,vr:number){
  if(i+1>=a.length)return false;const entry=a[i+1].open,risk=Math.abs(entry-stop),rp=risk/entry;if(risk<=0||rp>.0035||rp<.00035)return false;
  const sim=simulate(a,i+1,side,entry,stop,targetR,30,.5);if(!sim)return false;const ss=session(a[i].time);if(ss==="OTHER")return false;
  out.push({time:a[i].time,side,entry,stop,risk,netR:sim.netR,grossR:sim.grossR,exitTime:sim.exitTime,family,session:ss,trendStrength:ts,volRatio:vr,bucket:bucket(family,ss,ts,vr)});return true;
}
function events(a:C[]){
  const out:E[]=[];let lockPull=0,lockRev=0;
  for(let i=110;i<a.length-40;i++){
    const c=a[i],ss=session(c.time);if(ss==="OTHER")continue;const fast=atr(a,i-1,24),slow=atr(a,i-1,96);if(!fast||!slow)continue;
    const vr=fast/slow,diff=a[i-1].close-a[i-49].close,ts=Math.abs(diff)/fast,r=c.high-c.low||1;
    if(c.time>=lockPull&&ts>=1.35){
      const side:"LONG"|"SHORT"=diff>0?"LONG":"SHORT",m=avg(a,i,12);
      const ok=side==="LONG"?c.low<=m+fast*.18&&c.close>m&&c.close>c.open&&(c.close-c.low)/r>.6:c.high>=m-fast*.18&&c.close<m&&c.close<c.open&&(c.high-c.close)/r>.6;
      if(ok){const swing=side==="LONG"?Math.min(...a.slice(i-3,i+1).map(x=>x.low)):Math.max(...a.slice(i-3,i+1).map(x=>x.high)),entry=a[i+1].open,atrStop=side==="LONG"?entry-fast*.7:entry+fast*.7,stop=side==="LONG"?Math.min(swing,atrStop):Math.max(swing,atrStop);if(add(out,a,i,side,stop,1.5,"PULLBACK",ts,vr))lockPull=out[out.length-1].exitTime+10*60000}
    }
    if(c.time>=lockRev&&vr<=1.6&&ts<=3.5){
      const m=avg(a,i,24),upper=m+fast,lower=m-fast,up=c.high-Math.max(c.open,c.close),dn=Math.min(c.open,c.close)-c.low;let side:"LONG"|"SHORT"|null=null;
      if(c.low<lower&&c.close>lower&&c.close>c.open&&dn/r>.22)side="LONG";if(c.high>upper&&c.close<upper&&c.close<c.open&&up/r>.22)side="SHORT";
      if(side){const stop=side==="LONG"?c.low-fast*.12:c.high+fast*.12;if(add(out,a,i,side,stop,1.2,"REVERSION",ts,vr))lockRev=out[out.length-1].exitTime+10*60000}
    }
  }return out.sort((x,y)=>x.time-y.time);
}
function bucketStats(xs:E[]){
  const m=new Map<string,E[]>();for(const x of xs){const z=m.get(x.bucket)||[];z.push(x);m.set(x.bucket,z)}
  return[...m.entries()].map(([key,z])=>{const mm=metrics(z,90),sum=z.reduce((s,x)=>s+x.netR,0),shrunk=sum/(z.length+15);return{key,n:z.length,...mm,shrunk:+shrunk.toFixed(3),eligible:z.length>=8&&mm.avgR>.04&&mm.profitFactor>1.08&&shrunk>.025}}).sort((a,b)=>b.shrunk-a.shrunk);
}
function nonOverlap(xs:E[]){const out:E[]=[];let free=-Infinity;for(const x of xs.sort((a,b)=>a.time-b.time)){if(x.time<free)continue;out.push(x);free=x.exitTime}return out}
export function runAlpha2MetaLab(raw:any[]){
  const a=prep(raw);if(a.length<5000)return{status:"insufficient_data",candles:a.length};const ev=events(a),start=a[0].time,end=a[a.length-1].time,trainDays=90,stepDays=30,folds:any[]=[],all:E[]=[];
  let testStart=start+trainDays*86400000;
  while(testStart+stepDays*86400000<=end+86400000){
    const trainStart=testStart-trainDays*86400000,testEnd=testStart,testStop=Math.min(end+1,testStart+stepDays*86400000),tr=ev.filter(x=>x.time>=trainStart&&x.time<testEnd),bs=bucketStats(tr),allowed=new Set(bs.filter(x=>x.eligible).map(x=>x.key)),rawTest=ev.filter(x=>x.time>=testStart&&x.time<testStop&&allowed.has(x.bucket)),test=nonOverlap(rawTest);
    const tm=metrics(tr,trainDays),xm=metrics(test,(testStop-testStart)/86400000);all.push(...test);folds.push({trainStart:new Date(trainStart).toISOString(),testStart:new Date(testStart).toISOString(),testEnd:new Date(testStop).toISOString(),trainEvents:tr.length,eligibleBuckets:[...allowed],topBuckets:bs.slice(0,8),test:xm});
    testStart+=stepDays*86400000;
  }
  const agg=metrics(nonOverlap(all),Math.max(1,(end-(start+trainDays*86400000))/86400000)),positiveFolds=folds.filter(f=>f.test.netR>0).length,activeFolds=folds.filter(f=>f.test.trades>0).length;
  const baseline=metrics(nonOverlap(ev),Math.max(1,(end-start)/86400000));
  return{status:"ok",model:"CONDITIONAL_EXPECTANCY_META_FILTER_V1",candles:a.length,events:ev.length,from:new Date(start).toISOString(),to:new Date(end).toISOString(),trainingWindowDays:trainDays,testStepDays:stepDays,costStress:"0.50 ponto XAUUSD/trade",features:["family","session","trendStrength/ATR","ATR24/ATR96"],baseline,aggregate:agg,folds:folds.map(f=>({testStart:f.testStart,testEnd:f.testEnd,trainEvents:f.trainEvents,eligibleBuckets:f.eligibleBuckets,test:f.test,topBuckets:f.topBuckets.slice(0,4)})),positiveFolds,activeFolds,pass:activeFolds>=6&&positiveFolds/Math.max(1,activeFolds)>=.6&&agg.trades>=30&&agg.avgR>.04&&agg.profitFactor>1.08&&agg.maxDrawdownR<=10,warning:"Meta-filtro usa apenas dados anteriores a cada mês de teste. Ainda é pesquisa e exige forward LIVE antes de qualquer uso real."};
}
