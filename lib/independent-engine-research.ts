import { simulate } from "@/lib/exit-policy-research";
import type { BaseCandidate } from "@/lib/ai-management-research";

type Raw=any; type Side="LONG"|"SHORT"; type C={time:number;open:number;high:number;low:number;close:number};
type Engine="LIQUIDITY_REVERSAL"|"INSTITUTIONAL_PULLBACK"|"LIQUIDITY_CONTINUATION";
type Diag=BaseCandidate&{features:{h1Aligned:boolean;m15Aligned:boolean;bos:boolean;disp:boolean;ob:boolean;fvg:boolean;candle:boolean;sweep:boolean;counterSweep:boolean;fib:boolean;riskPct:number}};

function mid(v:any){const b=Number(v?.bid),a=Number(v?.ask??v?.offer);if(Number.isFinite(b)&&Number.isFinite(a))return(b+a)/2;if(Number.isFinite(b))return b;if(Number.isFinite(a))return a;return null}
function norm(r:Raw):C|null{const open=mid(r?.openPrice),high=mid(r?.highPrice),low=mid(r?.lowPrice),close=mid(r?.closePrice),s=r?.snapshotTimeUTC??r?.snapshotTime,time=s?Date.parse(String(s).endsWith("Z")?s:`${s}Z`):NaN;if([open,high,low,close].some(x=>x===null)||!Number.isFinite(time))return null;return{time,open:open!,high:high!,low:low!,close:close!}}
function agg(src:C[],m:number){const z=m*60000,out:C[]=[];let k=-1,c:C|null=null;for(const x of src){const b=Math.floor(x.time/z)*z;if(b!==k){if(c)out.push(c);k=b;c={...x,time:b}}else if(c){c.high=Math.max(c.high,x.high);c.low=Math.min(c.low,x.low);c.close=x.close}}if(c)out.push(c);return out}
function swings(a:C[],n=2){const hs:number[]=[],ls:number[]=[];for(let i=n;i<a.length-n;i++){let h=true,l=true;for(let j=1;j<=n;j++){if(a[i].high<=a[i-j].high||a[i].high<=a[i+j].high)h=false;if(a[i].low>=a[i-j].low||a[i].low>=a[i+j].low)l=false}if(h)hs.push(i);if(l)ls.push(i)}return{hs,ls}}
function flow(a:C[]):Side|null{const h=a.slice(-80),s=swings(h);if(s.hs.length<2||s.ls.length<2)return null;const H1=h[s.hs.at(-1)!].high,H0=h[s.hs.at(-2)!].high,L1=h[s.ls.at(-1)!].low,L0=h[s.ls.at(-2)!].low;return H1>H0&&L1>L0?"LONG":H1<H0&&L1<L0?"SHORT":null}
function fib(a:C[],side:Side,p:number){const x=a.slice(-48);if(x.length<12)return false;const hi=Math.max(...x.map(c=>c.high)),lo=Math.min(...x.map(c=>c.low)),r=hi-lo;if(r<=0)return false;const a1=side==="LONG"?hi-r*.618:lo+r*.618,a2=side==="LONG"?hi-r*.786:lo+r*.786;return p>=Math.min(a1,a2)&&p<=Math.max(a1,a2)}
function fvg(a:C[],side:Side,p:number){for(let i=Math.max(2,a.length-24);i<a.length;i++){const x=a[i-2],z=a[i];if(side==="LONG"&&x.high<z.low&&p>=x.high&&p<=z.low)return true;if(side==="SHORT"&&x.low>z.high&&p<=x.low&&p>=z.high)return true}return false}
function displacementAt(a:C[],i:number,side:Side){if(i<10)return false;const c=a[i],prior=a.slice(i-10,i),b=prior.map(x=>Math.abs(x.close-x.open)).sort((x,y)=>x-y),med=b[Math.floor(b.length/2)]||0,body=Math.abs(c.close-c.open),rng=c.high-c.low||1,dir=side==="LONG"?c.close>c.open:c.close<c.open;return dir&&body>med*1.5&&body/rng>.58}
function displacement(a:C[],side:Side){return a.length>10&&displacementAt(a,a.length-1,side)}
function obValidated(a:C[],side:Side,p:number){for(let i=a.length-5;i>=Math.max(2,a.length-30);i--){const c=a[i];if(side==="LONG"&&c.close<c.open){for(let j=i+1;j<=Math.min(i+4,a.length-1);j++)if(displacementAt(a,j,"LONG")&&a[j].close>c.high&&p>=c.low&&p<=c.high)return true}if(side==="SHORT"&&c.close>c.open){for(let j=i+1;j<=Math.min(i+4,a.length-1);j++)if(displacementAt(a,j,"SHORT")&&a[j].close<c.low&&p>=c.low&&p<=c.high)return true}}return false}
function sweepLocal(a:C[],side:Side,n=10){if(a.length<n+1)return false;const s=a.at(-1)!,q=a.slice(-n-1,-1),lo=Math.min(...q.map(x=>x.low)),hi=Math.max(...q.map(x=>x.high));return side==="LONG"?s.low<lo&&s.close>lo:s.high>hi&&s.close<hi}
function candle(a:C[],side:Side){if(a.length<2)return false;const c=a.at(-1)!,p=a.at(-2)!,body=Math.abs(c.close-c.open),rng=c.high-c.low||1;const engulf=side==="LONG"?c.close>c.open&&p.close<p.open&&c.close>=p.open&&c.open<=p.close:c.close<c.open&&p.close>p.open&&c.close<=p.open&&c.open>=p.close;const pin=side==="LONG"?(Math.min(c.open,c.close)-c.low)>body*1.6&&body/rng<.5:(c.high-Math.max(c.open,c.close))>body*1.6&&body/rng<.5;return engulf||pin}
function bos(a:C[],side:Side,n=5){if(a.length<n+1)return false;const c=a.at(-1)!,q=a.slice(-n-1,-1);return side==="LONG"?c.close>Math.max(...q.map(x=>x.high)):c.close<Math.min(...q.map(x=>x.low))}
function m1ok(a:C[],side:Side,t:number){if(a.length<8||!a.at(-1)||a.at(-1)!.time<t-120000)return false;return bos(a,side,4)||candle(a,side)||sweepLocal(a,side,7)||displacement(a,side)}
function inWindow(t:number){const d=new Date(t),m=d.getUTCHours()*60+d.getUTCMinutes();return m<=1110}
function dayKey(t:number){const d=new Date(t);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())}
function prevDayLevels(all:C[],i:number){const today=dayKey(all[i].time);let hi=-Infinity,lo=Infinity,found=false,prev:number|null=null;for(let j=i-1;j>=0;j--){const dk=dayKey(all[j].time);if(dk===today)continue;if(!found){found=true;prev=dk}else if(dk!==prev)break;hi=Math.max(hi,all[j].high);lo=Math.min(lo,all[j].low)}return found?{hi,lo}:null}
function sessionLevels(all:C[],i:number){const today=dayKey(all[i].time),asiaEnd=today+6*3600000;let asiaHi=-Infinity,asiaLo=Infinity,midOpen:number|null=null;for(let j=i;j>=0;j--){if(dayKey(all[j].time)!==today)break;if(all[j].time<asiaEnd){asiaHi=Math.max(asiaHi,all[j].high);asiaLo=Math.min(asiaLo,all[j].low)}midOpen=all[j].open}return{asiaHi,asiaLo,midOpen}}
function sweepLevel(c:C,side:Side,levels:number[]){return levels.some(l=>Number.isFinite(l)&&(side==="LONG"?c.low<l&&c.close>l:c.high>l&&c.close<l))}

function scoreEngine(engine:Engine,x:any){
  let s=0;
  if(engine==="LIQUIDITY_REVERSAL"){
    if(x.majorSweep)s+=28;if(x.sweep)s+=10;if(x.disp)s+=16;if(x.bos)s+=16;if(x.ob)s+=12;if(x.fvg)s+=10;if(x.candle)s+=8;if(x.h1&&x.h1!==x.side)s+=6;
  }else if(engine==="INSTITUTIONAL_PULLBACK"){
    if(x.h1===x.side)s+=16;if(x.m15===x.side)s+=12;if(x.ob)s+=18;if(x.fvg)s+=12;if(x.disp)s+=12;if(x.bos)s+=12;if(x.candle)s+=8;if(x.sweep)s+=10;
  }else{
    if(x.h1===x.side)s+=18;if(x.m15===x.side)s+=12;if(x.counterSweep)s+=22;if(x.bos)s+=14;if(x.disp)s+=12;if(x.ob)s+=10;if(x.fvg)s+=8;if(x.candle)s+=6;
  }
  if(x.fibM5)s+=10;
  return s;
}

function build(raw5:Raw[],raw1:Raw[],engine:Engine,threshold:number){
  const m5=raw5.map(norm).filter((x):x is C=>!!x).sort((a,b)=>a.time-b.time),m1=raw1.map(norm).filter((x):x is C=>!!x).sort((a,b)=>a.time-b.time),m15=agg(m5,15),h1=agg(m5,60),out:Diag[]=[];
  let p15=-1,p1=-1,pm1=-1;
  for(let i=120;i<m5.length-50;i++){
    const s=m5[i],ct=s.time+300000;
    while(p15+1<m15.length&&m15[p15+1].time<=ct-900000)p15++;
    while(p1+1<h1.length&&h1[p1+1].time<=ct-3600000)p1++;
    while(pm1+1<m1.length&&m1[pm1+1].time<=ct-60000)pm1++;
    if(p15<40||p1<25||pm1<8||!inWindow(s.time))continue;
    const a5=m5.slice(Math.max(0,i-120),i+1),a15=m15.slice(Math.max(0,p15-100),p15+1),a1=h1.slice(Math.max(0,p1-100),p1+1),aM1=m1.slice(Math.max(0,pm1-25),pm1+1),h1f=flow(a1),m15f=flow(a15),pd=prevDayLevels(m5,i),sess=sessionLevels(m5,i);
    for(const side of ["LONG","SHORT"] as Side[]){
      const levels=side==="LONG"?[pd?.lo??NaN,sess.asiaLo,sess.midOpen??NaN]:[pd?.hi??NaN,sess.asiaHi,sess.midOpen??NaN];
      const common={side,h1:h1f,m15:m15f,majorSweep:sweepLevel(s,side,levels),sweep:sweepLocal(a5,side,8),counterSweep:sweepLocal(a5,side,12),disp:displacement(a5,side),bos:bos(a5,side),ob:obValidated(a5,side,s.close)||obValidated(a15,side,s.close),fvg:fvg(a5,side,s.close)||fvg(a15,side,s.close),candle:candle(a5,side),fibM5:fib(a5,side,s.close)};
      const score=scoreEngine(engine,common);
      if(score<threshold||!m1ok(aM1,side,ct-60000))continue;
      const en=m5[i+1].open,stop=side==="LONG"?Math.min(...a5.slice(-10).map(c=>c.low)):Math.max(...a5.slice(-10).map(c=>c.high)),risk=Math.abs(en-stop);
      if(risk<=0||risk/en>.005)continue;
      const take=side==="LONG"?en+risk*2:en-risk*2,path=m5.slice(i+1,Math.min(i+49,m5.length));
      out.push({side,entry:en,stop,take,risk,time:s.time,baselineR:0,path,h1f,score,majorSweep:common.majorSweep,institutionalScore:engine==="INSTITUTIONAL_PULLBACK"?score:0,continuationScore:engine==="LIQUIDITY_CONTINUATION"?score:0,engineAgreement:1,features:{h1Aligned:h1f===side,m15Aligned:m15f===side,bos:common.bos,disp:common.disp,ob:common.ob,fvg:common.fvg,candle:common.candle,sweep:common.sweep,counterSweep:common.counterSweep,fib:common.fibM5,riskPct:risk/en}});
      break;
    }
  }
  return out;
}

function stats(cs:BaseCandidate[]){
  const rows=cs.map(c=>{const r=simulate(c,"RUNNER_3R" as any),usd=r*Math.abs(c.entry-c.stop);return{time:c.time,r,usd}});
  const trades=rows.length,totalR=rows.reduce((s,x)=>s+x.r,0),totalUsd=rows.reduce((s,x)=>s+x.usd,0),wins=rows.filter(x=>x.r>0).length,stops=rows.filter(x=>x.r<=-.999).length;
  let eq=0,peak=0,dd=0;for(const x of rows){eq+=x.r;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq)}
  return{trades,totalR:+totalR.toFixed(2),avgR:+(totalR/Math.max(1,trades)).toFixed(3),totalUsd:+totalUsd.toFixed(2),avgUsd:+(totalUsd/Math.max(1,trades)).toFixed(2),winRate:+(wins/Math.max(1,trades)*100).toFixed(1),fullStopRate:+(stops/Math.max(1,trades)*100).toFixed(1),maxDrawdownR:+dd.toFixed(2)};
}


function filteredStats(cs:Diag[],pred:(c:Diag)=>boolean){return stats(cs.filter(pred))}
function diagnose(cs:Diag[]){
  return {
    all:stats(cs),
    alignedBoth:filteredStats(cs,c=>c.features.h1Aligned&&c.features.m15Aligned),
    bosAndDisp:filteredStats(cs,c=>c.features.bos&&c.features.disp),
    alignedBosDisp:filteredStats(cs,c=>c.features.h1Aligned&&c.features.m15Aligned&&c.features.bos&&c.features.disp),
    obOrFvgBos:filteredStats(cs,c=>(c.features.ob||c.features.fvg)&&c.features.bos),
    fibBosDisp:filteredStats(cs,c=>c.features.fib&&c.features.bos&&c.features.disp),
    riskTight:filteredStats(cs,c=>c.features.riskPct<=.0035),
    noBos:filteredStats(cs,c=>!c.features.bos),
    noDisp:filteredStats(cs,c=>!c.features.disp),
    misalignedH1:filteredStats(cs,c=>!c.features.h1Aligned),
    misalignedM15:filteredStats(cs,c=>!c.features.m15Aligned)
  };
}

export function runIndependentEngineResearch(raw5:any[],raw1:any[]){
  const engines:Engine[]=["LIQUIDITY_REVERSAL","INSTITUTIONAL_PULLBACK","LIQUIDITY_CONTINUATION"],thresholds=[58,64,68,72];
  const results:any[]=[];
  for(const engine of engines)for(const threshold of thresholds){const cs=build(raw5,raw1,engine,threshold);results.push({engine,threshold,...stats(cs),diagnostics:(engine!=="LIQUIDITY_REVERSAL"&&[64,68].includes(threshold))?diagnose(cs):undefined})}
  return{results};
}
