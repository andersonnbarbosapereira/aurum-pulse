import {C,T,atr,blockMetrics,buildLevels,inWindow,metrics,prep,push,day} from "@/lib/alpha2-lab-core";
type P={family:string;id:string;params:any;trades:T[]};

function sweep(a:C[],p:any){
  const out:T[]=[],lv=buildLevels(a);let lock=0;
  for(let i=60;i<a.length-40;i++){const c=a[i];if(!inWindow(c.time)||c.time<lock)continue;const av=atr(a,i-1),d=day(c.time),pd=lv.pd.get(d),as=lv.asia.get(d);if(!av)continue;
    const levels:number[]=[];if((p.source==="PD"||p.source==="BOTH")&&pd)levels.push(pd.lo,pd.hi);if((p.source==="ASIA"||p.source==="BOTH")&&as)levels.push(as.lo,as.hi);
    let side:"LONG"|"SHORT"|null=null,ref=NaN;
    for(const l of levels){if(c.low<l&&c.close>l&&(Math.min(c.open,c.close)-c.low)/(c.high-c.low||1)>=p.wick){side="LONG";ref=l;break}if(c.high>l&&c.close<l&&(c.high-Math.max(c.open,c.close))/(c.high-c.low||1)>=p.wick){side="SHORT";ref=l;break}}
    if(!side)continue;
    if(p.trend){const j=Math.max(0,i-p.trend),mom=a[i-1].close-a[j].close;if(side==="LONG"&&mom<0)continue;if(side==="SHORT"&&mom>0)continue}
    const stop=side==="LONG"?Math.min(c.low,ref-av*p.pad):Math.max(c.high,ref+av*p.pad);
    if(push(out,a,i,side,stop,p.target,30,"SESSION_SWEEP"))lock=out[out.length-1].exitTime+10*60000;
  }return out;
}
function fvg(a:C[],p:any){
  const out:T[]=[],zones:{side:"LONG"|"SHORT";lo:number;hi:number;i:number}[]=[];let lock=0;
  for(let i=2;i<a.length-40;i++){const av=atr(a,i-1);if(!av)continue;const mid=a[i-1],disp=Math.abs(mid.close-mid.open);
    if(a[i-2].high<a[i].low&&disp>=av*p.disp)zones.push({side:"LONG",lo:a[i-2].high,hi:a[i].low,i});
    if(a[i-2].low>a[i].high&&disp>=av*p.disp)zones.push({side:"SHORT",lo:a[i].high,hi:a[i-2].low,i});
    if(!inWindow(a[i].time)||a[i].time<lock)continue;
    for(let z=zones.length-1;z>=0;z--){const q=zones[z];if(i-q.i<1)continue;if(i-q.i>p.age)break;const c=a[i],touch=c.low<=q.hi&&c.high>=q.lo;if(!touch)continue;
      const trendJ=Math.max(0,i-p.trend),mom=a[i-1].close-a[trendJ].close;if(q.side==="LONG"&&mom<=0||q.side==="SHORT"&&mom>=0)continue;
      const zoneMid=(q.lo+q.hi)/2,confirm=q.side==="LONG"?c.close>zoneMid&&c.close>c.open:c.close<zoneMid&&c.close<c.open;if(!confirm)continue;
      const stop=q.side==="LONG"?q.lo-av*p.pad:q.hi+av*p.pad;if(push(out,a,i,q.side,stop,p.target,36,"FVG_RETEST")){lock=out[out.length-1].exitTime+10*60000;break}
    }
  }return out;
}
function retest(a:C[],p:any){
  const out:T[]=[];let lock=0;
  for(let i=Math.max(50,p.lookback+5);i<a.length-40;i++){if(!inWindow(a[i].time)||a[i].time<lock)continue;const av=atr(a,i-1);if(!av)continue;
    let done=false;
    for(let lag=1;lag<=p.retest&&!done;lag++){const bi=i-lag,b=a[bi],q=a.slice(bi-p.lookback,bi),hi=Math.max(...q.map(x=>x.high)),lo=Math.min(...q.map(x=>x.low)),range=b.high-b.low;if(range<av*p.expansion)continue;
      let side:"LONG"|"SHORT"|null=null,level=NaN;if(b.close>hi)side="LONG",level=hi;if(b.close<lo)side="SHORT",level=lo;if(!side)continue;
      const c=a[i],tol=av*.12,ok=side==="LONG"?c.low<=level+tol&&c.close>level&&c.close>c.open:c.high>=level-tol&&c.close<level&&c.close<c.open;if(!ok)continue;
      const trendJ=Math.max(0,bi-p.trend),mom=a[bi-1].close-a[trendJ].close;if(side==="LONG"&&mom<=0||side==="SHORT"&&mom>=0)continue;
      const stop=side==="LONG"?Math.min(c.low,level-av*p.stop):Math.max(c.high,level+av*p.stop);if(push(out,a,i,side,stop,p.target,30,"EXPANSION_RETEST")){lock=out[out.length-1].exitTime+10*60000;done=true}
    }
  }return out;
}
function pack(c:P,start:number,reserve:number,end:number){
  const train=c.trades.filter(x=>x.time<reserve),test=c.trades.filter(x=>x.time>=reserve),tm=metrics(train,(reserve-start)/86400000),rm=metrics(test,(end-reserve)/86400000),blocks=blockMetrics(train,start,reserve,3),pos=blocks.filter(x=>x.netR>0).length,minTrades=Math.min(...blocks.map(x=>x.trades)),minR=Math.min(...blocks.map(x=>x.netR));
  const score=pos*12+tm.avgR*45+Math.min(3,tm.profitFactor)*3+Math.min(2,tm.tradesPerDay)*5-tm.maxDrawdownR*1.35+(minR>0?8:0);
  const trainPass=tm.trades>=18&&pos>=2&&tm.avgR>.03&&tm.profitFactor>1.05&&tm.maxDrawdownR<=8&&minTrades>=3;
  const reservePass=rm.trades>=5&&rm.netR>0&&rm.avgR>.03&&rm.profitFactor>=1.05&&rm.maxDrawdownR<=5;
  return{id:c.id,family:c.family,params:c.params,score:+score.toFixed(2),train:tm,trainBlocks:blocks,positiveTrainBlocks:pos,minTrainBlockR:+minR.toFixed(2),trainPass,reserve:rm,reservePass};
}
export function runAlpha2Lab(raw:any[]){
  const a=prep(raw);if(a.length<1000)return{status:"insufficient_data",candles:a.length};const start=a[0].time,end=a[a.length-1].time,reserve=start+(end-start)*.75,cands:P[]=[];
  for(const source of ["PD","ASIA","BOTH"])for(const wick of [.25,.4])for(const trend of [0,24,48])for(const pad of [.05,.15])for(const target of [1.2,1.5,1.8]){const params={source,wick,trend,pad,target};cands.push({family:"SESSION_SWEEP",id:`SW-${source}-${wick}-${trend}-${pad}-${target}`,params,trades:sweep(a,params)})}
  for(const disp of [.8,1.1,1.4])for(const age of [8,16,24])for(const trend of [24,48])for(const pad of [.1,.25])for(const target of [1.2,1.5,1.8]){const params={disp,age,trend,pad,target};cands.push({family:"FVG_RETEST",id:`FVG-${disp}-${age}-${trend}-${pad}-${target}`,params,trades:fvg(a,params)})}
  for(const lookback of [12,18,24])for(const expansion of [1,1.25])for(const retestBars of [2,4])for(const trend of [24,48])for(const stop of [.5,.75])for(const target of [1.2,1.5,1.8]){const params={lookback,expansion,retest:retestBars,trend,stop,target};cands.push({family:"EXPANSION_RETEST",id:`ER-${lookback}-${expansion}-${retestBars}-${trend}-${stop}-${target}`,params,trades:retest(a,params)})}
  const ranked=cands.map(x=>pack(x,start,reserve,end)).sort((x,y)=>y.score-x.score),selected=ranked.filter(x=>x.trainPass).slice(0,20),validated=selected.filter(x=>x.reservePass);
  const proposed=selected.find(x=>x.reservePass)??null;
  return{status:"ok",candles:a.length,from:new Date(start).toISOString(),reserveFrom:new Date(reserve).toISOString(),to:new Date(end).toISOString(),validation:"Primeiros 75% para seleção; 25% finais reservados e invisíveis ao ranking.",costStress:"0.50 ponto XAUUSD por trade",variantsTested:ranked.length,trainQualified:ranked.filter(x=>x.trainPass).length,reserveValidated:validated.length,proposed,validated:validated.slice(0,10),topTraining:ranked.slice(0,12),warning:"Mesmo candidato aprovado no reserve continua experimental e deve passar por forward LIVE antes de uso real."};
}
