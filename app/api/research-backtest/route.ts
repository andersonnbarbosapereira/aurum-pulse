import { NextResponse } from "next/server";
import { getHistoricalPrices, resolveGoldEpic } from "@/lib/capital";
import { runResearch } from "@/lib/research-backtest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function safeHistorical(epic:string,resolution:string,from:Date,to:Date){
  try{return await getHistoricalPrices(epic,resolution,from,to,1000)}catch(error){
    const m=error instanceof Error?error.message:"";
    if(m==="CAPITAL_API_404") return [];
    throw error;
  }
}

async function fetchChunks(epic:string,resolution:string,start:Date,end:Date,chunkMinutes:number){
  const jobs:{from:Date;to:Date}[]=[]; const step=chunkMinutes*60_000;
  for(let t=start.getTime();t<end.getTime();t+=step) jobs.push({from:new Date(t),to:new Date(Math.min(t+step-1,end.getTime()))});
  const out:any[]=[];
  for(let i=0;i<jobs.length;i+=5){
    const batch=jobs.slice(i,i+5);
    const parts=await Promise.all(batch.map(j=>safeHistorical(epic,resolution,j.from,j.to)));
    for(const p of parts)out.push(...p);
    if(i+5<jobs.length) await new Promise(r=>setTimeout(r,550));
  }
  const seen=new Map<string,any>();
  for(const c of out){const k=String(c?.snapshotTimeUTC??c?.snapshotTime);if(k)seen.set(k,c)}
  return [...seen.values()];
}

export async function GET(){
  try{
    const epic=await resolveGoldEpic(); const end=new Date(); const start=new Date(end.getTime()-90*86_400_000);
    const [m5,m1]=await Promise.all([
      fetchChunks(epic,"MINUTE_5",start,end,3*24*60),
      fetchChunks(epic,"MINUTE",start,end,16*60)
    ]);
    const result=runResearch(m5,m1,90);
    return NextResponse.json({mode:"five-engine-research",source:"Capital.com",epic,requestedDays:90,...result},{headers:{"X-Robots-Tag":"noindex"}});
  }catch(error){const diagnostic=error instanceof Error?error.message:"UNKNOWN_ERROR";return NextResponse.json({status:"unavailable",error:"Research backtest could not be completed.",diagnostic},{status:502});}
}
