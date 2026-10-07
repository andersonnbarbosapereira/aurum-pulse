type Raw=any;
type Side="LONG"|"SHORT";
type Candle={time:number;open:number;high:number;low:number;close:number};
type Params={lookback:number;compression:number;expansion:number;trendBars:number;targetR:number;stopAtr:number};
type Trade={time:number;side:Side;entry:number;stop:number;risk:number;grossR:number;netR:number;exitTime:number;reason:string};

function mid(v:any){
  const b=Number(v?.bid),a=Number(v?.ask??v?.offer);
  if(Number.isFinite(b)&&Number.isFinite(a))return(b+a)/2;
  if(Number.isFinite(b))return b;
  if(Number.isFinite(a))return a;
  return NaN;
}
function norm(r:Raw):Candle|null{
  const t=r?.snapshotTimeUTC??r?.snapshotTime??r?.time;
  const time=Date.parse(String(t||"").endsWith("Z")?String(t):String(t||"")+"Z");
  const open=mid(r?.openPrice),high=mid(r?.highPrice),low=mid(r?.lowPrice),close=mid(r?.closePrice);
  return [time,open,high,low,close].every(Number.isFinite)?{time,open,high,low,close}:null;
}
function tr(c:Candle,p:Candle){return Math.max(c.high-c.low,Math.abs(c.high-p.close),Math.abs(c.low-p.close))}
function avgTR(a:Candle[],i:number,n:number){
  if(i<1)return 0;
  let s=0,k=0;
  for(let j=Math.max(1,i-n+1);j<=i;j++){s+=tr(a[j],a[j-1]);k++}
  return k?s/k:0;
}
function inWindow(t:number){
  const d=new Date(t),m=d.getUTCHours()*60+d.getUTCMinutes();
  return m>=0&&m<=1110;
}
function dayKey(t:number){
  const d=new Date(t);
  return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
}
function simulate(a:Candle[],i:number,side:Side,entry:number,stop:number,targetR:number,maxBars=36,costPoints=.5){
  const risk=Math.abs(entry-stop);
  if(risk<=0)return null;
  const target=side==="LONG"?entry+risk*targetR:entry-risk*targetR;
  let grossR=0,exitTime=a[Math.min(i+maxBars,a.length-1)]?.time??a[i].time,reason="TIME";
  for(let j=i;j<Math.min(a.length,i+maxBars);j++){
    const c=a[j],hitStop=side==="LONG"?c.low<=stop:c.high>=stop,hitTarget=side==="LONG"?c.high>=target:c.low<=target;
    if(hitStop){grossR=-1;exitTime=c.time;reason="STOP";break}
    if(hitTarget){grossR=targetR;exitTime=c.time;reason="TARGET";break}
    if(j===Math.min(a.length-1,i+maxBars-1)){
      const mark=c.close;
      grossR=side==="LONG"?(mark-entry)/risk:(entry-mark)/risk;
      grossR=Math.max(-1,Math.min(targetR,grossR));
    }
  }
  const netR=grossR-costPoints/risk;
  return{grossR,netR,exitTime,reason,risk};
}
function buildTrades(raw:Raw[],p:Params){
  const a=raw.map(norm).filter((x):x is Candle=>!!x).sort((x,y)=>x.time-y.time),out:Trade[]=[];
  let lastSignal=-Infinity;
  for(let i=Math.max(80,p.trendBars+5);i<a.length-40;i++){
    const c=a[i]; if(!inWindow(c.time)||c.time-lastSignal<25*60000)continue;
    const slow=avgTR(a,i-1,24),fast=avgTR(a,i-1,6); if(!slow||!fast||fast/slow>p.compression)continue;
    const prior=a.slice(i-p.lookback,i),hi=Math.max(...prior.map(x=>x.high)),lo=Math.min(...prior.map(x=>x.low));
    const range=c.high-c.low,body=Math.abs(c.close-c.open),closeLoc=range>0?(c.close-c.low)/range:.5;
    if(range<slow*p.expansion||body/range<.55)continue;
    const trend=(a[i-1].close/a[i-p.trendBars].close)-1;
    const minTrend=Math.max(.0007,slow/Math.max(1,c.close)*.55);
    let side:Side|null=null;
    if(c.close>hi&&closeLoc>=.72&&trend>minTrend)side="LONG";
    if(c.close<lo&&closeLoc<=.28&&trend<-minTrend)side="SHORT";
    if(!side)continue;
    const entry=a[i+1].open;
    const structural=side==="LONG"?Math.min(c.low,hi-slow*.08):Math.max(c.high,lo+slow*.08);
    const atrStop=side==="LONG"?entry-slow*p.stopAtr:entry+slow*p.stopAtr;
    const stop=side==="LONG"?Math.min(structural,atrStop):Math.max(structural,atrStop);
    const risk=Math.abs(entry-stop),riskPct=risk/entry;
    if(risk<=0||riskPct>.0035||riskPct<.00045)continue;
    const sim=simulate(a,i+1,side,entry,stop,p.targetR,36,.5); if(!sim)continue;
    out.push({time:c.time,side,entry,stop,risk,grossR:sim.grossR,netR:sim.netR,exitTime:sim.exitTime,reason:sim.reason});
    lastSignal=c.time;
  }
  return out;
}
function summarize(ts:Trade[]){
  const n=ts.length,w=ts.filter(x=>x.netR>0).length;
  const net=ts.reduce((s,x)=>s+x.netR,0),gross=ts.reduce((s,x)=>s+x.grossR,0);
  const gp=ts.filter(x=>x.netR>0).reduce((s,x)=>s+x.netR,0),gl=-ts.filter(x=>x.netR<0).reduce((s,x)=>s+x.netR,0);
  let eq=0,peak=0,dd=0;
  for(const x of ts){eq+=x.netR;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq)}
  const days=[...new Set(ts.map(x=>dayKey(x.time)))].length;
  return{
    trades:n,
    winRate:+(n?w/n*100:0).toFixed(1),
    grossR:+gross.toFixed(2),
    netR:+net.toFixed(2),
    avgNetR:+(n?net/n:0).toFixed(3),
    profitFactor:+(gl?gp/gl:gp>0?99:0).toFixed(2),
    maxDrawdownR:+dd.toFixed(2),
    tradesPerActiveDay:+(days?n/days:0).toFixed(2)
  };
}
function blocks(ts:Trade[],start:number,end:number,count=4){
  const width=(end-start)/count,out:any[]=[];
  for(let b=0;b<count;b++){
    const lo=start+b*width,hi=b===count-1?end+1:start+(b+1)*width;
    out.push(summarize(ts.filter(x=>x.time>=lo&&x.time<hi)));
  }
  return out;
}
function key(p:Params){return `L${p.lookback}-C${p.compression}-E${p.expansion}-T${p.trendBars}-R${p.targetR}-S${p.stopAtr}`}
export function runGodEngineLab(raw:Raw[]){
  const candles=raw.map(norm).filter((x):x is Candle=>!!x).sort((a,b)=>a.time-b.time);
  if(candles.length<500)return{status:"insufficient_data",candles:candles.length,results:[]};
  const start=candles[0].time,end=candles.at(-1)!.time;
  const lookbacks=[12,18,24],compressions=[.8,.95],expansions=[1.05,1.25],trends=[12,24],targets=[1.5,2],stops=[.8,1.0];
  const results:any[]=[];
  for(const lookback of lookbacks)for(const compression of compressions)for(const expansion of expansions)for(const trendBars of trends)for(const targetR of targets)for(const stopAtr of stops){
    const params={lookback,compression,expansion,trendBars,targetR,stopAtr},trades=buildTrades(raw,params),all=summarize(trades),bs=blocks(trades,start,end,4);
    const positiveBlocks=bs.filter(x=>x.netR>0).length,minBlock=Math.min(...bs.map(x=>x.netR)),blockTrades=Math.min(...bs.map(x=>x.trades));
    const stability=(positiveBlocks*10)+(all.avgNetR*35)+(Math.min(2,all.tradesPerActiveDay)*4)-(all.maxDrawdownR*1.4)+(minBlock>0?8:0);
    results.push({id:key(params),params,...all,positiveBlocks,minBlockR:+minBlock.toFixed(2),minBlockTrades:blockTrades,stability:+stability.toFixed(2),blocks:bs});
  }
  results.sort((a,b)=>b.stability-a.stability);
  const robust=results.filter(r=>r.trades>=24&&r.positiveBlocks>=3&&r.avgNetR>=.08&&r.maxDrawdownR<=8&&r.minBlockTrades>=3);
  const top=robust.slice(0,12);
  return{
    status:"ok",
    engineFamily:"VOLATILITY_EXPANSION_TREND",
    hypothesis:"Compressão de volatilidade + candle de expansão + rompimento do range local na direção do momentum, com risco estrutural limitado.",
    costStress:"0.50 ponto de XAUUSD debitado de cada trade antes das métricas líquidas.",
    candles:candles.length,
    from:new Date(start).toISOString(),
    to:new Date(end).toISOString(),
    variantsTested:results.length,
    robustCandidates:robust.length,
    top,
    best:top[0]??null,
    warning:"Laboratório exploratório. Seleção de parâmetros no mesmo histórico ainda pode superestimar performance; exige bloco reservado/out-of-sample e forward antes de uso real."
  };
}
