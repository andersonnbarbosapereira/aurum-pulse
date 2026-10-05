type Raw=any; type Side="LONG"|"SHORT"; type TF="M5"|"M15"|"H1";
type C={time:number;open:number;high:number;low:number;close:number};
type Trade={r:number};
type State={blocked:number;trades:Trade[]};

function mid(v:any){const b=Number(v?.bid),a=Number(v?.ask??v?.offer);if(Number.isFinite(b)&&Number.isFinite(a))return(b+a)/2;if(Number.isFinite(b))return b;if(Number.isFinite(a))return a;return null;}
function norm(r:Raw):C|null{const open=mid(r?.openPrice),high=mid(r?.highPrice),low=mid(r?.lowPrice),close=mid(r?.closePrice),s=r?.snapshotTimeUTC??r?.snapshotTime,time=s?Date.parse(String(s).endsWith("Z")?s:`${s}Z`):NaN;if([open,high,low,close].some(x=>x===null)||!Number.isFinite(time))return null;return{time,open:open!,high:high!,low:low!,close:close!};}
function agg(src:C[],m:number){const z=m*60000,out:C[]=[];let k=-1,c:C|null=null;for(const x of src){const b=Math.floor(x.time/z)*z;if(b!==k){if(c)out.push(c);k=b;c={...x,time:b};}else if(c){c.high=Math.max(c.high,x.high);c.low=Math.min(c.low,x.low);c.close=x.close;}}if(c)out.push(c);return out;}
function swings(a:C[],n=2){const hs:number[]=[],ls:number[]=[];for(let i=n;i<a.length-n;i++){let h=true,l=true;for(let j=1;j<=n;j++){if(a[i].high<=a[i-j].high||a[i].high<=a[i+j].high)h=false;if(a[i].low>=a[i-j].low||a[i].low>=a[i+j].low)l=false;}if(h)hs.push(i);if(l)ls.push(i);}return{hs,ls};}
function flow(a:C[]):Side|null{const h=a.slice(-80),s=swings(h);if(s.hs.length<2||s.ls.length<2)return null;const H1=h[s.hs.at(-1)!].high,H0=h[s.hs.at(-2)!].high,L1=h[s.ls.at(-1)!].low,L0=h[s.ls.at(-2)!].low;return H1>H0&&L1>L0?"LONG":H1<H0&&L1<L0?"SHORT":null;}
function fib(a:C[],side:Side,p:number){const x=a.slice(-40);if(x.length<12)return false;const hi=Math.max(...x.map(c=>c.high)),lo=Math.min(...x.map(c=>c.low)),r=hi-lo;if(r<=0)return false;const a1=side==="LONG"?hi-r*.618:lo+r*.618,b=side==="LONG"?hi-r*.786:lo+r*.786;return p>=Math.min(a1,b)&&p<=Math.max(a1,b);}
function fvg(a:C[],side:Side,p:number){for(let i=Math.max(2,a.length-20);i<a.length;i++){const x=a[i-2],z=a[i];if(side==="LONG"&&x.high<z.low&&p>=x.high&&p<=z.low)return true;if(side==="SHORT"&&x.low>z.high&&p<=x.low&&p>=z.high)return true;}return false;}
function ob(a:C[],side:Side,p:number){for(let i=a.length-3;i>=Math.max(1,a.length-20);i--){const c=a[i],n=a[i+1];if(side==="LONG"&&c.close<c.open&&n.close>c.high&&p>=c.low&&p<=c.high)return true;if(side==="SHORT"&&c.close>c.open&&n.close<c.low&&p>=c.low&&p<=c.high)return true;}return false;}
function sweep(a:C[],side:Side){if(a.length<8)return false;const s=a.at(-1)!,q=a.slice(-8,-1),lo=Math.min(...q.map(x=>x.low)),hi=Math.max(...q.map(x=>x.high));return side==="LONG"?s.low<lo&&s.close>lo:s.high>hi&&s.close<hi;}
function candle(a:C[],side:Side){if(a.length<2)return false;const c=a.at(-1)!,p=a.at(-2)!,body=Math.abs(c.close-c.open),rng=c.high-c.low||1;const engulf=side==="LONG"?c.close>c.open&&p.close<p.open&&c.close>=p.open&&c.open<=p.close:c.close<c.open&&p.close>p.open&&c.close<=p.open&&c.open>=p.close;const pin=side==="LONG"?(Math.min(c.open,c.close)-c.low)>body*1.5&&body/rng<.55:(c.high-Math.max(c.open,c.close))>body*1.5&&body/rng<.55;return engulf||pin;}
function bos(a:C[],side:Side){if(a.length<5)return false;const c=a.at(-1)!,q=a.slice(-5,-1);return side==="LONG"?c.close>Math.max(...q.map(x=>x.high)):c.close<Math.min(...q.map(x=>x.low));}
function m1ok(a:C[],side:Side,t:number){if(a.length<6||!a.at(-1)||a.at(-1)!.time<t-120000)return false;return bos(a,side)||candle(a,side)||sweep(a,side);}
function metrics(ts:Trade[],days:number){const total=ts.reduce((s,t)=>s+t.r,0),w=ts.filter(t=>t.r>0),l=ts.filter(t=>t.r<0),gw=w.reduce((s,t)=>s+t.r,0),gl=Math.abs(l.reduce((s,t)=>s+t.r,0));let e=0,p=0,dd=0;for(const t of ts){e+=t.r;p=Math.max(p,e);dd=Math.max(dd,p-e);}return{trades:ts.length,tradesPerDay:+(ts.length/days).toFixed(2),winRate:ts.length?+(w.length/ts.length*100).toFixed(1):0,totalR:+total.toFixed(2),expectancyR:ts.length?+(total/ts.length).toFixed(3):0,profitFactor:gl?+(gw/gl).toFixed(2):gw?99:0,maxDrawdownR:+dd.toFixed(2)};}

const engines=[
{id:"FLOW_OTE",name:"Fluxo + OTE defendida",ok:(x:any)=>x.h1===x.side&&x.m15===x.side&&x.fib&&(x.candle||x.sweep)&&x.bos},
{id:"SWEEP_REVERSAL",name:"Sweep + reversão",ok:(x:any)=>x.sweep&&x.candle&&x.bos&&(x.ob||x.fvg)&&(!x.h1||x.h1!==x.side)},
{id:"FVG_CONTINUATION",name:"Deslocamento + FVG",ok:(x:any)=>x.h1===x.side&&x.m15===x.side&&x.fvg&&x.bos&&(x.fib||x.candle)},
{id:"OB_RETEST",name:"Order block + reteste",ok:(x:any)=>x.h1===x.side&&x.ob&&x.bos&&(x.sweep||x.candle||x.fvg)},
{id:"LIQUIDITY_SESSION",name:"Liquidez + sessão",ok:(x:any)=>x.session&&x.sweep&&x.bos&&(x.fib||x.ob||x.fvg)&&x.candle}
];
const tfs:TF[]=["M5","M15","H1"];
function key(e:string,tf:TF,m1:boolean){return`${e}|${tf}|${m1?1:0}`;}

export function runResearch(raw5:Raw[],raw1:Raw[],days=90){
 const m5=raw5.map(norm).filter((x):x is C=>!!x).sort((a,b)=>a.time-b.time),m1=raw1.map(norm).filter((x):x is C=>!!x).sort((a,b)=>a.time-b.time),m15=agg(m5,15),h1=agg(m5,60);
 const states=new Map<string,State>();for(const E of engines)for(const tf of tfs)for(const u of [false,true])states.set(key(E.id,tf,u),{blocked:-1,trades:[]});
 let p15=-1,p1=-1,pm1=-1;
 for(let i=100;i<m5.length-2;i++){
  const s=m5[i],closeTime=s.time+300000;
  while(p15+1<m15.length&&m15[p15+1].time<=closeTime-900000)p15++;
  while(p1+1<h1.length&&h1[p1+1].time<=closeTime-3600000)p1++;
  while(pm1+1<m1.length&&m1[pm1+1].time<=s.time)pm1++;
  if(p15<30||p1<20)continue;
  const a5=m5.slice(Math.max(0,i-100),i+1),a15=m15.slice(Math.max(0,p15-100),p15+1),a1=h1.slice(Math.max(0,p1-100),p1+1),aM1=pm1>=0?m1.slice(Math.max(0,pm1-20),pm1+1):[];
  const h1f=flow(a1),m15f=flow(a15),hour=new Date(s.time).getUTCHours(),session=hour>=6&&hour<20;
  for(const side of ["LONG","SHORT"] as Side[]){
   const common={side,h1:h1f,m15:m15f,ob:ob(a5,side,s.close)||ob(a15,side,s.close),fvg:fvg(a5,side,s.close)||fvg(a15,side,s.close),sweep:sweep(a5,side),candle:candle(a5,side),bos:bos(a5,side),session};
   const fibs:{[K in TF]:boolean}={M5:fib(a5,side,s.close),M15:fib(a15,side,s.close),H1:fib(a1,side,s.close)};
   for(const E of engines)for(const tf of tfs){const x={...common,fib:fibs[tf]};if(!E.ok(x))continue;for(const useM1 of [false,true]){
    const st=states.get(key(E.id,tf,useM1))!;if(i<=st.blocked)continue;if(useM1&&(!session||!m1ok(aM1,side,s.time)))continue;
    const en=m5[i+1].open,stop=side==="LONG"?Math.min(...a5.slice(-8).map(c=>c.low)):Math.max(...a5.slice(-8).map(c=>c.high)),risk=Math.abs(en-stop);if(risk<=0||risk/en>.008)continue;const rr=1.5,take=side==="LONG"?en+risk*rr:en-risk*rr;let r=0,ex=Math.min(i+48,m5.length-1),res="EXPIRED";
    for(let j=i+1;j<=ex;j++){const c=m5[j],sh=side==="LONG"?c.low<=stop:c.high>=stop,th=side==="LONG"?c.high>=take:c.low<=take;if(sh){r=-1;ex=j;res="SL";break}if(th){r=rr;ex=j;res="TP";break}}
    if(res==="EXPIRED"){const px=m5[ex].close;r=side==="LONG"?(px-en)/risk:(en-px)/risk;r=Math.max(-1,Math.min(rr,r));}
    st.trades.push({r:+r.toFixed(3)});st.blocked=ex;
   }}
  }
 }
 const variants:any[]=[];for(const E of engines)for(const tf of tfs)for(const useM1 of [false,true])variants.push({engine:E.id,name:E.name,fibTimeframe:tf,m1Confirmation:useM1,metrics:metrics(states.get(key(E.id,tf,useM1))!.trades,days)});
 variants.sort((a,b)=>b.metrics.expectancyR-a.metrics.expectancyR||b.metrics.totalR-a.metrics.totalR);
 return{methodology:{lookahead:false,movingAverages:false,minRR:1.5,fibonacci:tfs,m1Tested:true,m1Role:"confirmation only during liquid London/New York window",engines:engines.map(e=>({id:e.id,name:e.name}))},sample:{m5Bars:m5.length,m1Bars:m1.length,from:m5[0]?new Date(m5[0].time).toISOString():null,to:m5.at(-1)?new Date(m5.at(-1)!.time).toISOString():null},variants,best:variants.slice(0,10)};
}
