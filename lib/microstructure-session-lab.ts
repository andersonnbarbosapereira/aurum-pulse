type Raw=any;
type Session="ASIA"|"EUROPE"|"US";
type C={time:number;open:number;high:number;low:number;close:number};
type S={date:string;session:Session;start:number;end:number;bars:C[];open30Ret:number;open30Range:number;entry:number;exit:number};
type T={time:number;date:string;session:Session;side:-1|1;gross:number;net:number};
type Mode="M"|"R";
type MapSpec=Record<Session,Mode>;

function mid(v:any){const b=Number(v?.bid),a=Number(v?.ask??v?.offer);if(Number.isFinite(b)&&Number.isFinite(a))return(b+a)/2;if(Number.isFinite(b))return b;if(Number.isFinite(a))return a;return NaN}
function norm(r:Raw):C|null{const s=String(r?.snapshotTimeUTC??r?.snapshotTime??r?.time??""),time=Date.parse(s.endsWith("Z")?s:s+"Z"),open=mid(r?.openPrice),high=mid(r?.highPrice),low=mid(r?.lowPrice),close=mid(r?.closePrice);return[time,open,high,low,close].every(Number.isFinite)?{time,open,high,low,close}:null}
function prep(raw:Raw[]){return raw.map(norm).filter((x):x is C=>!!x).sort((a,b)=>a.time-b.time)}
function dateKey(t:number){const d=new Date(t);return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`}
function sess(t:number):Session|null{const d=new Date(t),m=d.getUTCHours()*60+d.getUTCMinutes();if(m>=0&&m<480)return"ASIA";if(m>=480&&m<870)return"EUROPE";if(m>=870&&m<1440)return"US";return null}
function median(xs:number[]){if(!xs.length)return NaN;const z=[...xs].sort((a,b)=>a-b),m=Math.floor(z.length/2);return z.length%2?z[m]:(z[m-1]+z[m])/2}
function buildSessions(a:C[]):S[]{const g=new Map<string,C[]>();for(const c of a){const s=sess(c.time);if(!s)continue;const k=dateKey(c.time)+"|"+s,z=g.get(k)||[];z.push(c);g.set(k,z)}const out:S[]=[];for(const[k,z0]of g){const z=[...z0].sort((x,y)=>x.time-y.time);if(z.length<5)continue;const[date,session]=k.split("|") as [string,Session];const first=z.slice(0,2),o=z[0].open,signalClose=first[1].close,entry=z[2].open,exit=z[z.length-1].close;if(!o||!entry)continue;out.push({date,session,start:z[0].time,end:z[z.length-1].time+900000,bars:z,open30Ret:signalClose/o-1,open30Range:(Math.max(...first.map(x=>x.high))-Math.min(...first.map(x=>x.low)))/o,entry,exit})}return out.sort((x,y)=>x.start-y.start)}
function mean(xs:number[]){return xs.length?xs.reduce((s,x)=>s+x,0)/xs.length:0}
function metrics(ts:T[],spanDays:number){const r=ts.map(x=>x.net),n=r.length,w=r.filter(x=>x>0),l=r.filter(x=>x<=0),gp=w.reduce((s,x)=>s+x,0),gl=-l.reduce((s,x)=>s+x,0);let eq=1,pk=1,dd=0;for(const x of r){eq*=1+x;pk=Math.max(pk,eq);dd=Math.max(dd,1-eq/pk)}const daily=new Map<string,number>();for(const t of ts)daily.set(t.date,(daily.get(t.date)||0)+t.net);const dr=[...daily.values()],mu=mean(dr),vr=dr.length>1?dr.reduce((s,x)=>s+(x-mu)**2,0)/(dr.length-1):0,sd=Math.sqrt(vr);const months=new Map<string,number>();for(const t of ts){const k=t.date.slice(0,7);months.set(k,(months.get(k)||0)+t.net)}const mv=[...months.values()];return{trades:n,winRate:+(n?w.length/n*100:0).toFixed(1),totalReturnPct:+((eq-1)*100).toFixed(2),avgTradeBps:+(n?mean(r)*10000:0).toFixed(2),profitFactor:+(gl?gp/gl:gp>0?99:0).toFixed(2),maxDrawdownPct:+(dd*100).toFixed(2),dailySharpe:+(sd?mu/sd*Math.sqrt(252):0).toFixed(2),tradesPerDay:+(n/Math.max(1,spanDays*5/7)).toFixed(2),positiveMonths:+(mv.length?mv.filter(x=>x>0).length/mv.length:0).toFixed(2),asia:ts.filter(x=>x.session==="ASIA").length,europe:ts.filter(x=>x.session==="EUROPE").length,us:ts.filter(x=>x.session==="US").length}}
function build(ss:S[],evalStart:number,cost:number,volGate:boolean,map:MapSpec){const hist:Record<Session,number[]>={ASIA:[],EUROPE:[],US:[]},out:T[]=[];for(const x of ss){const h=hist[x.session],med=h.length>=30?median(h.slice(-60)):NaN,eligible=!volGate||(Number.isFinite(med)&&Math.abs(x.open30Ret)>=med);if(x.end>=evalStart&&eligible&&x.open30Ret!==0){const sign:-1|1=x.open30Ret>0?1:-1;const follow=map[x.session]==="M";const side:(-1|1)=follow?sign:(sign===1?-1:1);const gross=(x.exit/x.entry-1)*side;out.push({time:x.end,date:x.date,session:x.session,side,gross,net:gross-cost})}h.push(Math.abs(x.open30Ret))}return out}
export function runMicrostructureSessionLab(raw:Raw[],evalDays=180){
  const a=prep(raw),ss=buildSessions(a);
  if(ss.length<180)return{status:"insufficient_data",candles:a.length,sessions:ss.length};
  const last=ss[ss.length-1].end,evalStart=last-evalDays*86400000,span=(last-evalStart)/86400000;
  const codes=["MMM","MMR","MRM","MRR","RMM","RMR","RRM","RRR"];
  const variants:any={};
  for(const code of codes){
    const map:MapSpec={ASIA:code[0] as Mode,EUROPE:code[1] as Mode,US:code[2] as Mode};
    variants["MAP_"+code+"_ALL_2BPS"]=metrics(build(ss,evalStart,.0002,false,map),span);
    variants["MAP_"+code+"_VOLMED_2BPS"]=metrics(build(ss,evalStart,.0002,true,map),span);
  }
  const ranking=Object.entries(variants).map(([id,m]:any)=>({id,...m})).sort((x,y)=>y.dailySharpe-x.dailySharpe);
  const frozenMap:MapSpec={ASIA:"M",EUROPE:"R",US:"R"};
  const frozenCostStress={
    COST_2BPS:metrics(build(ss,evalStart,.0002,true,frozenMap),span),
    COST_4BPS:metrics(build(ss,evalStart,.0004,true,frozenMap),span),
    COST_6BPS:metrics(build(ss,evalStart,.0006,true,frozenMap),span),
    COST_10BPS:metrics(build(ss,evalStart,.0010,true,frozenMap),span)
  };
  return{
    status:"ok",
    model:"MICROSTRUCTURE_SESSION_MAP_GRID_V2",
    candles:a.length,
    sessions:ss.length,
    from:new Date(a[0].time).toISOString(),
    evaluationFrom:new Date(evalStart).toISOString(),
    to:new Date(a[a.length-1].time).toISOString(),
    rules:{
      sessions:"Asia 00:00-08:00 UTC; Europe 08:00-14:30 UTC; US 14:30-24:00 UTC",
      signal:"sign of first 30m session return",
      mapLegend:"M=follow opening move, R=fade opening move; code order Asia/Europe/US",
      gate:"VOLMED requires abs(first-30m return) >= causal rolling median of prior up to 60 same-session observations; min 30",
      entry:"next M15 open after first 30m closes",
      exit:"last M15 close of same session",
      cost:"2 bps round trip"
    },
    variants,
    ranking,
    frozenCandidate:{
      id:"MRR_VOLMED_V1",
      map:"Asia momentum; Europe reversal; US reversal",
      selectedAfter2019_2023Development:true,
      gate:"abs first-30m return >= causal rolling median of prior up to 60 same-session observations; min 30",
      costStress:frozenCostStress
    },
    warning:"Eight structural session-direction mappings x optional causal volatility gate. Development grid only; winner must be frozen across multiple Capital windows before untouched HistData testing."
  };
}
