type Raw=any;
type C={time:number;open:number;high:number;low:number;close:number};
function mid(v:any){const b=Number(v?.bid),a=Number(v?.ask??v?.offer);if(Number.isFinite(b)&&Number.isFinite(a))return(b+a)/2;if(Number.isFinite(b))return b;if(Number.isFinite(a))return a;return NaN}
function norm(r:Raw):C|null{const s=String(r?.snapshotTimeUTC??r?.snapshotTime??""),time=Date.parse(s),open=mid(r?.openPrice),high=mid(r?.highPrice),low=mid(r?.lowPrice),close=mid(r?.closePrice);return[time,open,high,low,close].every(Number.isFinite)?{time,open,high,low,close}:null}
function dstStart(y:number){const d=new Date(Date.UTC(y,2,1)),first=(7-d.getUTCDay())%7+1;return Date.UTC(y,2,first+7,7)}
function dstEnd(y:number){const d=new Date(Date.UTC(y,10,1)),first=(7-d.getUTCDay())%7+1;return Date.UTC(y,10,first,6)}
function ny(t:number){const y=new Date(t).getUTCFullYear(),off=t>=dstStart(y)&&t<dstEnd(y)?-4:-5,d=new Date(t+off*3600000);return{date:`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`,m:d.getUTCHours()*60+d.getUTCMinutes()}}
function mean(x:number[]){return x.length?x.reduce((s,v)=>s+v,0)/x.length:0}
function corr(a:number[],b:number[]){if(a.length<3)return 0;const ma=mean(a),mb=mean(b);let n=0,da=0,db=0;for(let i=0;i<a.length;i++){n+=(a[i]-ma)*(b[i]-mb);da+=(a[i]-ma)**2;db+=(b[i]-mb)**2}return da&&db?n/Math.sqrt(da*db):0}
function med(x:number[]){const z=[...x].sort((a,b)=>a-b),m=Math.floor(z.length/2);return z.length?z.length%2?z[m]:(z[m-1]+z[m])/2:NaN}
function stats(x:number[]){const pos=x.filter(v=>v>0);return{n:x.length,meanBps:+(mean(x)*10000).toFixed(2),positivePct:+(x.length?pos.length/x.length*100:0).toFixed(1)}}
export function runNyInformationStudy(raw:Raw[]){
 const a=raw.map(norm).filter((x):x is C=>!!x).sort((x,y)=>x.time-y.time),g=new Map<string,C[]>();
 for(const c of a){const z=ny(c.time),q=g.get(z.date)||[];q.push(c);g.set(z.date,q)}
 const days:any[]=[];
 for(const [date,z0] of g){const z=z0.sort((x,y)=>x.time-y.time),slice=(lo:number,hi:number)=>z.filter(c=>{const m=ny(c.time).m;return m>=lo&&m<hi});
   const london=slice(180,510),open=slice(510,540),rest=slice(540,960);if(london.length<10||open.length<2||rest.length<10)continue;
   const ret=(q:C[])=>q[q.length-1].close/q[0].open-1,range=(q:C[])=>(Math.max(...q.map(x=>x.high))-Math.min(...q.map(x=>x.low)))/q[0].open;
   days.push({date,london:ret(london),open30:ret(open),rest:ret(rest),openRange:range(open)});
 }
 const ranges=days.map(x=>x.openRange),mr=med(ranges),large=days.filter(x=>x.openRange>=mr),small=days.filter(x=>x.openRange<mr);
 const cont=(d:any[])=>d.map(x=>x.rest*Math.sign(x.open30||0)),fade=(d:any[])=>d.map(x=>-x.rest*Math.sign(x.open30||0));
 const londonCont=(d:any[])=>d.map(x=>x.rest*Math.sign(x.london||0));
 const aligned=days.filter(x=>Math.sign(x.london)===Math.sign(x.open30)&&x.open30!==0),conflict=days.filter(x=>Math.sign(x.london)!==Math.sign(x.open30)&&x.open30!==0);
 const largeAligned=large.filter(x=>Math.sign(x.london)===Math.sign(x.open30)&&x.open30!==0);
 return{status:"ok",model:"NY_INFORMATION_IMPULSE_STUDY_V1",days:days.length,from:days[0]?.date,to:days.at(-1)?.date,windows:{london:"03:00-08:30 New York",nyOpen:"08:30-09:00 New York",nyRest:"09:00-16:00 New York"},correlations:{open30_to_rest:+corr(days.map(x=>x.open30),days.map(x=>x.rest)).toFixed(3),london_to_rest:+corr(days.map(x=>x.london),days.map(x=>x.rest)).toFixed(3),london_to_open30:+corr(days.map(x=>x.london),days.map(x=>x.open30)).toFixed(3)},conditional:{all:{continuation:stats(cont(days)),fade:stats(fade(days))},largeOpenRange:{thresholdBps:+(mr*10000).toFixed(2),continuation:stats(cont(large)),fade:stats(fade(large))},smallOpenRange:{continuation:stats(cont(small)),fade:stats(fade(small))},londonAndNyOpenAligned:{continuation:stats(cont(aligned))},londonAndNyOpenConflict:{continuation:stats(cont(conflict)),fade:stats(fade(conflict))},largeRangeAndAligned:{continuation:stats(cont(largeAligned))},londonDirection:{continuationIntoNyRest:stats(londonCont(days))}},warning:"Descriptive causal study only. No strategy parameters are selected here; any trading rule must be frozen before later years are evaluated."}
}
