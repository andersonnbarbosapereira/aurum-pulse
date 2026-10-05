import { buildCandidates, type BaseCandidate } from "@/lib/ai-management-research";
import { simulate } from "@/lib/exit-policy-research";

type Config={name:string;maxPerDay:2|3;minScore:number;requireMajorSweep:boolean;maxRiskPct:number|null};

function dayBr(t:number){
  const d=new Date(t-3*3600000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
}

function select(cs:BaseCandidate[],cfg:Config){
  const counts=new Map<string,number>(),out:BaseCandidate[]=[];
  for(const c of cs){
    const riskPct=c.risk/c.entry;
    if(c.score<cfg.minScore)continue;
    if(cfg.requireMajorSweep&&!c.majorSweep)continue;
    if(cfg.maxRiskPct!=null&&riskPct>cfg.maxRiskPct)continue;
    const k=dayBr(c.time),n=counts.get(k)||0;
    if(n>=cfg.maxPerDay)continue;
    counts.set(k,n+1);
    out.push(c);
  }
  return out;
}

function stats(cs:BaseCandidate[]){
  const rows=cs.map(c=>{
    const r=simulate(c,"RUNNER_3R" as any),riskUsd=Math.abs(c.entry-c.stop);
    return{r,usd:r*riskUsd};
  });
  const trades=rows.length,totalR=rows.reduce((s,x)=>s+x.r,0),totalUsd=rows.reduce((s,x)=>s+x.usd,0);
  const wins=rows.filter(x=>x.r>0).length,losses=rows.filter(x=>x.r<0).length,stops=rows.filter(x=>x.r<=-.999).length;
  let eq=0,peak=0,dd=0;
  for(const x of rows){eq+=x.r;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq);}
  return{trades,totalR:+totalR.toFixed(2),avgR:+(totalR/Math.max(1,trades)).toFixed(3),totalUsd:+totalUsd.toFixed(2),avgUsd:+(totalUsd/Math.max(1,trades)).toFixed(2),winRate:+(wins/Math.max(1,trades)*100).toFixed(1),lossRate:+(losses/Math.max(1,trades)*100).toFixed(1),fullStopRate:+(stops/Math.max(1,trades)*100).toFixed(1),maxDrawdownR:+dd.toFixed(2)};
}

export function runQualityResearch(raw5:any[],raw1:any[],limit=500){
  const all=buildCandidates(raw5,raw1,limit);
  const configs:Config[]=[
    {name:"MAX3_SCORE64",maxPerDay:3,minScore:64,requireMajorSweep:false,maxRiskPct:null},
    {name:"MAX3_SCORE68",maxPerDay:3,minScore:68,requireMajorSweep:false,maxRiskPct:null},
    {name:"MAX3_SCORE72",maxPerDay:3,minScore:72,requireMajorSweep:false,maxRiskPct:null},
    {name:"MAX2_SCORE68",maxPerDay:2,minScore:68,requireMajorSweep:false,maxRiskPct:null},
    {name:"MAX2_SCORE72",maxPerDay:2,minScore:72,requireMajorSweep:false,maxRiskPct:null},
    {name:"MAX3_SCORE68_RISCO05",maxPerDay:3,minScore:68,requireMajorSweep:false,maxRiskPct:.005},
    {name:"MAX3_SCORE72_RISCO05",maxPerDay:3,minScore:72,requireMajorSweep:false,maxRiskPct:.005},
    {name:"MAX3_SWEEP_SCORE64",maxPerDay:3,minScore:64,requireMajorSweep:true,maxRiskPct:null},
    {name:"MAX2_SWEEP_SCORE64",maxPerDay:2,minScore:64,requireMajorSweep:true,maxRiskPct:null}
  ];
  return{rawCandidates:all.length,baseline:stats(all),results:configs.map(config=>({config,...stats(select(all,config))}))};
}
