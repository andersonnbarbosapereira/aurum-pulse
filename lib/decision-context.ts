import { getHistoricalPrices, getLiveQuote, resolveGoldEpic } from "@/lib/capital";

type C={time:number;open:number;high:number;low:number;close:number};
type Bias="BULLISH"|"BEARISH"|"NEUTRAL";

function mid(v:any){
  const b=Number(v?.bid),a=Number(v?.ask??v?.offer);
  if(Number.isFinite(b)&&Number.isFinite(a))return(b+a)/2;
  if(Number.isFinite(b))return b;
  if(Number.isFinite(a))return a;
  return NaN;
}
function candle(x:any):C|null{
  const time=Date.parse(x?.snapshotTimeUTC||x?.snapshotTime||x?.time||"");
  const open=mid(x?.openPrice),high=mid(x?.highPrice),low=mid(x?.lowPrice),close=mid(x?.closePrice);
  return [time,open,high,low,close].every(Number.isFinite)?{time,open,high,low,close}:null;
}
function aggregate(src:C[],mins:number){
  const ms=mins*60000,out:C[]=[];let cur:C|null=null,key=-1;
  for(const c of src){
    const k=Math.floor(c.time/ms)*ms;
    if(k!==key){if(cur)out.push(cur);key=k;cur={...c,time:k};}
    else if(cur){cur.high=Math.max(cur.high,c.high);cur.low=Math.min(cur.low,c.low);cur.close=c.close;}
  }
  if(cur)out.push(cur);
  return out;
}
function atr(cs:C[],n=14){
  if(cs.length<2)return 0;
  const tr=cs.slice(1).map((c,i)=>Math.max(c.high-c.low,Math.abs(c.high-cs[i].close),Math.abs(c.low-cs[i].close)));
  return tr.slice(-n).reduce((a,b)=>a+b,0)/Math.max(1,Math.min(n,tr.length));
}
function pivots(cs:C[]){
  const out:Array<{price:number;time:number;kind:"H"|"L"}>=[];
  for(let i=2;i<cs.length-2;i++){
    const c=cs[i];
    if(c.high>=cs[i-1].high&&c.high>=cs[i-2].high&&c.high>=cs[i+1].high&&c.high>=cs[i+2].high)out.push({price:c.high,time:c.time,kind:"H"});
    if(c.low<=cs[i-1].low&&c.low<=cs[i-2].low&&c.low<=cs[i+1].low&&c.low<=cs[i+2].low)out.push({price:c.low,time:c.time,kind:"L"});
  }
  return out;
}
function tfState(cs:C[]){
  const ps=pivots(cs);
  const hs=ps.filter(x=>x.kind==="H").slice(-2),ls=ps.filter(x=>x.kind==="L").slice(-2);
  let bias:Bias="NEUTRAL";
  if(hs.length===2&&ls.length===2){
    if(hs[1].price>hs[0].price&&ls[1].price>ls[0].price)bias="BULLISH";
    if(hs[1].price<hs[0].price&&ls[1].price<ls[0].price)bias="BEARISH";
  }
  const last=cs.at(-1),a=atr(cs),body=last?Math.abs(last.close-last.open):0;
  const displacement=!!last&&a>0&&body>=a*.9;
  const recent=ps.slice(-10);
  const lastHigh=[...recent].reverse().find(x=>x.kind==="H"),lastLow=[...recent].reverse().find(x=>x.kind==="L");
  const bos=!!last&&((bias==="BULLISH"&&lastHigh&&last.close>lastHigh.price)||(bias==="BEARISH"&&lastLow&&last.close<lastLow.price));
  const sweep=!!last&&recent.some(p=>p.kind==="H"?last.high>p.price&&last.close<p.price:last.low<p.price&&last.close>p.price);
  return{bias,bos:!!bos,sweep,displacement,atr:+a.toFixed(2),lastClose:last?.close??null};
}
function multiTfLevels(m5:C[],price:number){
  const sets:[string,C[]][]=[["M5",m5],["M15",aggregate(m5,15)],["M30",aggregate(m5,30)],["H1",aggregate(m5,60)]];
  const points:Array<{price:number;time:number;tf:string}>=[], atrs:number[]=[];
  for(const [tf,cs] of sets){
    const a=atr(cs); if(a>0)atrs.push(a);
    for(const p of pivots(cs)){
      const idx=cs.findIndex(x=>x.time===p.time);
      const prev=idx>0?cs[idx-1]:null,next=idx>=0&&idx<cs.length-1?cs[idx+1]:null;
      const leg=Math.max(prev?Math.abs(p.price-(p.kind==="H"?prev.low:prev.high)):0,next?Math.abs(p.price-(p.kind==="H"?next.low:next.high)):0);
      if(!a||leg>=a*.8)points.push({price:p.price,time:p.time,tf});
    }
  }
  const tol=Math.max(price*.0006,(atrs.find(Boolean)??price*.001)*.35);
  points.sort((a,b)=>a.price-b.price);
  const clusters:Array<typeof points>=[];
  for(const p of points){
    const last=clusters.at(-1);
    const mean=last&&last.length?last.reduce((s,x)=>s+x.price,0)/last.length:null;
    if(last&&mean!==null&&Math.abs(p.price-mean)<=tol)last.push(p);else clusters.push([p]);
  }
  const levels=clusters.map(c=>{
    const tfs=[...new Set(c.map(x=>x.tf))];
    if(tfs.length<2)return null;
    const center=c.reduce((s,x)=>s+x.price,0)/c.length;
    const touches=c.length,lastTouch=Math.max(...c.map(x=>x.time));
    return{price:+center.toFixed(2),type:center<price?"SUPPORT" as const:"RESISTANCE" as const,timeframes:tfs,touches,strength:(tfs.length>=3||touches>=5?"FORTE":"MÉDIO") as "FORTE"|"MÉDIO",distance:+Math.abs(center-price).toFixed(2),distancePct:+(Math.abs(center-price)/price*100).toFixed(3),lastTouch:new Date(lastTouch).toISOString()};
  }).filter(Boolean) as Array<{price:number;type:"SUPPORT"|"RESISTANCE";timeframes:string[];touches:number;strength:"FORTE"|"MÉDIO";distance:number;distancePct:number;lastTouch:string}>;
  return{
    support:levels.filter(x=>x.type==="SUPPORT").sort((a,b)=>a.distance-b.distance).slice(0,4),
    resistance:levels.filter(x=>x.type==="RESISTANCE").sort((a,b)=>a.distance-b.distance).slice(0,4)
  };
}
function macroZones(hour:C[],price:number){
  const h4=aggregate(hour,240),a=Math.max(atr(hour),price*.001),pad=a*.35;
  const raw:Array<{low:number;high:number;weight:number;label:string}>=[];
  const add=(center:number,weight:number,label:string)=>raw.push({low:center-pad,high:center+pad,weight,label});
  for(const p of pivots(h4).slice(-20))add(p.price,2,"swing H4");
  const now=new Date();
  const utc=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())/1000;
  const weekStart=utc-((now.getUTCDay()+6)%7)*86400;
  const prevWeek=hour.filter(c=>c.time/1000>=weekStart-7*86400&&c.time/1000<weekStart);
  if(prevWeek.length){add(Math.max(...prevWeek.map(c=>c.high)),3,"máxima semana anterior");add(Math.min(...prevWeek.map(c=>c.low)),3,"mínima semana anterior");}
  const monthStart=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)/1000;
  const prevMonthStart=Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1)/1000;
  const prevMonth=hour.filter(c=>c.time/1000>=prevMonthStart&&c.time/1000<monthStart);
  if(prevMonth.length){add(Math.max(...prevMonth.map(c=>c.high)),4,"máxima mês anterior");add(Math.min(...prevMonth.map(c=>c.low)),4,"mínima mês anterior");}
  raw.sort((a,b)=>a.low-b.low);
  const merged:Array<{low:number;high:number;score:number;labels:string[]}>= [];
  for(const z of raw){
    const last=merged.at(-1);
    if(last&&z.low<=last.high){last.high=Math.max(last.high,z.high);last.score+=z.weight;last.labels.push(z.label);}
    else merged.push({low:z.low,high:z.high,score:z.weight,labels:[z.label]});
  }
  return merged.map(z=>({low:+z.low.toFixed(2),high:+z.high.toFixed(2),center:+((z.low+z.high)/2).toFixed(2),side:z.high<price?"DEMANDA":z.low>price?"OFERTA":"ATUAL",strength:z.score>=6?"FORTE":"MÉDIO",score:z.score,labels:[...new Set(z.labels)],distance:+Math.max(0,z.low>price?z.low-price:price>z.high?price-z.high:0).toFixed(2)})).sort((a,b)=>a.distance-b.distance).slice(0,6);
}

let cache:{at:number;data:any}|null=null;
export async function getDecisionContext(){
  if(cache&&Date.now()-cache.at<4*60_000)return cache.data;
  const epic=await resolveGoldEpic(),now=new Date(),quote=await getLiveQuote();
  const [r5,rh]=await Promise.all([
    getHistoricalPrices(epic,"MINUTE_5",new Date(now.getTime()-72*3600_000),now,1000),
    getHistoricalPrices(epic,"HOUR",new Date(now.getTime()-35*86400_000),now,1000)
  ]);
  const m5=r5.map((x:any)=>candle(x)).filter((x:C|null):x is C=>!!x),hour=rh.map((x:any)=>candle(x)).filter((x:C|null):x is C=>!!x);
  const frames={M5:tfState(m5),M15:tfState(aggregate(m5,15)),M30:tfState(aggregate(m5,30)),H1:tfState(aggregate(m5,60)),H4:tfState(aggregate(hour,240))};
  const data={updatedAt:new Date().toISOString(),price:quote.price,frames,levels:multiTfLevels(m5,quote.price),macroZones:macroZones(hour,quote.price)};
  cache={at:Date.now(),data}; return data;
}
