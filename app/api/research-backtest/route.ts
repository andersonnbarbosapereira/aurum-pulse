import { NextResponse } from "next/server";
import { getHistoricalPrices, resolveGoldEpic } from "@/lib/capital";
import { runResearch } from "@/lib/research-backtest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

async function safeHistorical(epic:string,resolution:string,from:Date,to:Date){
  for(let attempt=0;attempt<3;attempt++){
    try{return await getHistoricalPrices(epic,resolution,from,to,1000)}catch(error){
      const m=error instanceof Error?error.message:"";
      if(m==="CAPITAL_API_404") return [];
      if(m==="CAPITAL_API_429"&&attempt<2){await sleep(700*(attempt+1));continue;}
      throw error;
    }
  }
  return [];
}

async function runJobs(epic:string,resolution:string,jobs:{from:Date;to:Date}[]){
  const out:any[]=[];
  for(let i=0;i<jobs.length;i+=4){const parts=await Promise.all(jobs.slice(i,i+4).map(j=>safeHistorical(epic,resolution,j.from,j.to)));for(const p of parts)out.push(...p);if(i+4<jobs.length)await sleep(650);}
  return dedupe(out);
}

async function fetchM5(epic:string,start:Date,end:Date){
  const jobs:{from:Date;to:Date}[]=[];const step=3*86_400_000;
  for(let t=start.getTime();t<end.getTime();t+=step)jobs.push({from:new Date(t),to:new Date(Math.min(t+step-1,end.getTime()))});
  return runJobs(epic,"MINUTE_5",jobs);
}

async function fetchM1LiquidSessions(epic:string,start:Date,end:Date){
  const jobs:{from:Date;to:Date}[]=[];
  for(let d=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),start.getUTCDate()));d<end;d=new Date(d.getTime()+86_400_000)){
    const day=d.getUTCDay();if(day===0||day===6)continue;
    const from=new Date(d.getTime()+6*3_600_000),to=new Date(Math.min(d.getTime()+20*3_600_000-1,end.getTime()));
    if(to>start&&from<end)jobs.push({from,to});
  }
  return runJobs(epic,"MINUTE",jobs);
}

function dedupe(out:any[]){const seen=new Map<string,any>();for(const c of out){const k=String(c?.snapshotTimeUTC??c?.snapshotTime);if(k)seen.set(k,c)}return[...seen.values()];}

export async function GET(){
  try{
    const epic=await resolveGoldEpic(),end=new Date(),start90=new Date(end.getTime()-90*86_400_000),startM1=new Date(end.getTime()-30*86_400_000);
    const m5=await fetchM5(epic,start90,end);
    await sleep(700);
    const m1=await fetchM1LiquidSessions(epic,startM1,end);
    const result=runResearch(m5,m1,90,30);
    return NextResponse.json({mode:"five-engine-research",source:"Capital.com",epic,requestedDays:90,m1Coverage:"last 30 days, weekdays 06:00-20:00 UTC (auxiliary confirmation study)",...result},{headers:{"X-Robots-Tag":"noindex"}});
  }catch(error){const diagnostic=error instanceof Error?error.message:"UNKNOWN_ERROR";return NextResponse.json({status:"unavailable",error:"Research backtest could not be completed.",diagnostic},{status:502});}
}
