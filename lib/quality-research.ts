import { buildCandidates, type BaseCandidate } from "@/lib/ai-management-research";
import { simulate } from "@/lib/exit-policy-research";

type Config={
  name:string;
  minScore:number;
  maxRiskPct:number|null;
  minAgreement:number;
  minAuxScore:number|null;
  requireMajorSweep:boolean;
};

function select(cs:BaseCandidate[],cfg:Config){
  return cs.filter(c=>{
    const riskPct=c.risk/c.entry;
    const aux=Math.max(c.institutionalScore,c.continuationScore);
    if(c.score<cfg.minScore)return false;
    if(cfg.maxRiskPct!=null&&riskPct>cfg.maxRiskPct)return false;
    if(c.engineAgreement<cfg.minAgreement)return false;
    if(cfg.minAuxScore!=null&&aux<cfg.minAuxScore)return false;
    if(cfg.requireMajorSweep&&!c.majorSweep)return false;
    return true;
  });
}

function stats(cs:BaseCandidate[]){
  const rows=cs.map(c=>{
    const r=simulate(c,"RUNNER_3R" as any),riskUsd=Math.abs(c.entry-c.stop);
    return{r,usd:r*riskUsd,score:c.score,agreement:c.engineAgreement,inst:c.institutionalScore,cont:c.continuationScore};
  });
  const trades=rows.length,totalR=rows.reduce((s,x)=>s+x.r,0),totalUsd=rows.reduce((s,x)=>s+x.usd,0);
  const wins=rows.filter(x=>x.r>0).length,losses=rows.filter(x=>x.r<0).length,stops=rows.filter(x=>x.r<=-.999).length;
  let eq=0,peak=0,dd=0;
  for(const x of rows){eq+=x.r;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq);}
  return{
    trades,
    totalR:+totalR.toFixed(2),
    avgR:+(totalR/Math.max(1,trades)).toFixed(3),
    totalUsd:+totalUsd.toFixed(2),
    avgUsd:+(totalUsd/Math.max(1,trades)).toFixed(2),
    winRate:+(wins/Math.max(1,trades)*100).toFixed(1),
    lossRate:+(losses/Math.max(1,trades)*100).toFixed(1),
    fullStopRate:+(stops/Math.max(1,trades)*100).toFixed(1),
    maxDrawdownR:+dd.toFixed(2)
  };
}

export function runQualityResearch(raw5:any[],raw1:any[],limit=500){
  const all=buildCandidates(raw5,raw1,limit);
  const configs:Config[]=[
    {name:"SCORE72_RISCO05",minScore:72,maxRiskPct:.005,minAgreement:1,minAuxScore:null,requireMajorSweep:false},
    {name:"LR68_AUX50_RISCO05",minScore:68,maxRiskPct:.005,minAgreement:1,minAuxScore:50,requireMajorSweep:false},
    {name:"LR68_CONSENSO2_RISCO05",minScore:68,maxRiskPct:.005,minAgreement:2,minAuxScore:null,requireMajorSweep:false},
    {name:"LR72_CONSENSO2_RISCO05",minScore:72,maxRiskPct:.005,minAgreement:2,minAuxScore:null,requireMajorSweep:false},
    {name:"LR64_CONSENSO2_RISCO05",minScore:64,maxRiskPct:.005,minAgreement:2,minAuxScore:null,requireMajorSweep:false},
    {name:"LR68_AUX58",minScore:68,maxRiskPct:null,minAgreement:2,minAuxScore:58,requireMajorSweep:false},
    {name:"LR72_AUX58",minScore:72,maxRiskPct:null,minAgreement:2,minAuxScore:58,requireMajorSweep:false},
    {name:"LR72_AUX58_RISCO05",minScore:72,maxRiskPct:.005,minAgreement:2,minAuxScore:58,requireMajorSweep:false},
    {name:"LR68_AUX65_RISCO05",minScore:68,maxRiskPct:.005,minAgreement:2,minAuxScore:65,requireMajorSweep:false},
    {name:"LR72_SWEEP_CONSENSO2",minScore:72,maxRiskPct:null,minAgreement:2,minAuxScore:null,requireMajorSweep:true}
  ];
  return{
    rawCandidates:all.length,
    baseline:stats(all),
    results:configs.map(config=>({config,...stats(select(all,config))}))
  };
}
