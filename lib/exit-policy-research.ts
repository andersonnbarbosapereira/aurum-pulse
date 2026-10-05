import { buildCandidates, type BaseCandidate } from "@/lib/ai-management-research";

type Side="LONG"|"SHORT";
type Bar={time:number;open:number;high:number;low:number;close:number};
type Policy="ALVO_2R"|"RUNNER_3R"|"RUNNER_4R";

function rPrice(c:BaseCandidate,p:number){return c.side==="LONG"?(p-c.entry)/c.risk:(c.entry-p)/c.risk;}
function favorableR(c:BaseCandidate,b:Bar){return rPrice(c,c.side==="LONG"?b.high:b.low);}
function adverseR(c:BaseCandidate,b:Bar){return rPrice(c,c.side==="LONG"?b.low:b.high);}
function closeR(c:BaseCandidate,b:Bar){return rPrice(c,b.close);}
function clamp(x:number,a:number,b:number){return Math.max(a,Math.min(b,x));}

function swings(a:Bar[],n=2){const hs:number[]=[],ls:number[]=[];for(let i=n;i<a.length-n;i++){let h=true,l=true;for(let j=1;j<=n;j++){if(a[i].high<=a[i-j].high||a[i].high<=a[i+j].high)h=false;if(a[i].low>=a[i-j].low||a[i].low>=a[i+j].low)l=false;}if(h)hs.push(i);if(l)ls.push(i);}return{hs,ls};}
function structuralLockR(c:BaseCandidate,path:Bar[],i:number,minLock:number){
  const x=path.slice(Math.max(0,i-24),i+1),s=swings(x,2),current=closeR(c,path[i]);
  let r:number|null=null;
  if(c.side==="LONG"){
    for(let k=s.ls.length-1;k>=0;k--){const pr=rPrice(c,x[s.ls[k]].low);if(pr>0&&pr<current-.05){r=pr;break;}}
  } else {
    for(let k=s.hs.length-1;k>=0;k--){const pr=rPrice(c,x[s.hs[k]].high);if(pr>0&&pr<current-.05){r=pr;break;}}
  }
  const fallback=current>minLock+.05?minLock:Math.max(0,current-.08);
  return clamp(Math.max(fallback,r??0),0,Math.max(0,current-.05));
}

export function simulate(c:BaseCandidate,policy:Policy){
  if(policy==="ALVO_2R") return c.baselineR;
  let remaining=1,realized=0,stopR=-1,stage=0;
  const path=c.path as Bar[];
  for(let i=0;i<path.length;i++){
    const b=path[i],adv=adverseR(c,b),fav=favorableR(c,b);
    if(adv<=stopR) return realized+remaining*stopR;
    if(policy==="RUNNER_3R"){
      if(stage===0&&fav>=2){
        realized+=.30*2; remaining=.70; stage=1;
        const cr=closeR(c,b); if(cr>0) stopR=Math.max(stopR,structuralLockR(c,path,i,.75));
        if(fav>=3) return realized+remaining*3;
        continue;
      }
      if(stage===1&&fav>=3) return realized+remaining*3;
    } else {
      if(stage===0&&fav>=2){
        stage=1;
        const cr=closeR(c,b); if(cr>0) stopR=Math.max(stopR,structuralLockR(c,path,i,.70));
        if(fav>=3){realized+=.50*3;remaining=.50;stage=2;stopR=Math.max(stopR,2);if(fav>=4)return realized+remaining*4;}
        continue;
      }
      if(stage===1&&fav>=3){
        realized+=.50*3;remaining=.50;stage=2;stopR=Math.max(stopR,2);
        if(fav>=4)return realized+remaining*4;
        continue;
      }
      if(stage===2&&fav>=4)return realized+remaining*4;
    }
  }
  const last=path.at(-1); if(!last)return realized;
  return realized+remaining*clamp(closeR(c,last),stopR,policy==="RUNNER_3R"?3:4);
}

function stats(cs:BaseCandidate[],policy:Policy){
  const rows=cs.map(c=>{const r=simulate(c,policy),riskUsd=Math.abs(c.entry-c.stop);return{time:new Date(c.time).toISOString(),side:c.side,entry:+c.entry.toFixed(2),stop:+c.stop.toFixed(2),riskUsd:+riskUsd.toFixed(2),r:+r.toFixed(2),usd:+(riskUsd*r).toFixed(2)}});
  const rs=rows.map(x=>x.r),totalR=rs.reduce((a,b)=>a+b,0),usd=rows.reduce((a,b)=>a+b.usd,0),wins=rs.filter(r=>r>0).length,losses=rs.filter(r=>r<0).length;
  let eq=0,peak=0,dd=0;for(const r of rs){eq+=r;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq);}
  return{policy,trades:rows.length,totalR:+totalR.toFixed(2),avgR:+(totalR/Math.max(1,rows.length)).toFixed(3),winRate:+(wins/Math.max(1,rows.length)*100).toFixed(1),losses,maxDrawdownR:+dd.toFixed(2),totalUsd:+usd.toFixed(2),rows};
}

export function runExitPolicyResearch(raw5:any[],raw1:any[],limit=10){
  const cs=buildCandidates(raw5,raw1,limit);
  const policies=(["ALVO_2R","RUNNER_3R","RUNNER_4R"] as Policy[]).map(p=>stats(cs,p));
  const best=[...policies].sort((a,b)=>b.totalR-a.totalR)[0];
  return{sampleSize:cs.length,objective:"maximizar expectativa sem deixar vencedor validado voltar ao risco original",policies,bestPolicyByR:best?.policy??null};
}
