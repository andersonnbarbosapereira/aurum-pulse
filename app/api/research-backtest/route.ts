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

async function fetchM5(epic:string,start:Date,end:Date){
  const jobs:{from:Date;to:Date}[]=[]; const step=3*86_400_000;
  for(let t=start.getTime();t<end.getTime();t+=step)jobs.push({from:new Date(t),to:new Date(Math.min(t+step-1,end.getTime()))});
  const out:any[]=[];
  for(let i=0;i<jobs.length;i+=8){const parts=await Promise.all(jobs.slice(i,i+8).map(j=>safeHistorical(epic,"MINUTE_5",j.from,j.to)));for(const p of parts)out.push(...p);if(i+8<jobs.length)await new Promise(r=>setTimeout(r,850));}
  return dedupe(out);
}

async function fetchM1LiquidSessions(epic:string,start:Date,end:Date){
  const jobs:{from:Date;to:Date}[]=[];
  for(let d=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),start.getUTCDate()));d<end;d=new Date(d.getTime()+86_400_000)){
    const day=d.getUTCDay(); if(day===0||day===6)continue;
    const from=new Date(d.getTime()+6*3_600_000); const to=new Date(Math.min(d.getTime()+20*3_600_000-1,end.getTime()));
    if(to>start&&from<end)jobs.push({from,to});
  }
  const out:any[]=[];
  for(let i=0;i<jobs.length;i+=8){const parts=await Promise.all(jobs.slice(i,i+8).map(j=>safeHistorical(epic,"MINUTE",j.from,j.to)));for(const p of parts)out.push(...p);if(i+8<jobs.length)await new Promise(r=>setTimeout(r,850));}
  return dedupe(out);
}

function dedupe(out:any[]){const seen=new Map<string,any>();for(const c of out){const k=String(c?.snapshotTimeUTC??c?.snapshotTime);if(k)seen.set(k,c)}return[...seen.values()];}

export async function GET(){
  try{
    const epic=await resolveGoldEpic();const end=new Date();const start=new Date(end.getTime()-90*86_400_000);
    const [m5,m1]=await Promise.all([fetchM5(epic,start,end),fetchM1LiquidSessions(epic,start,end)]);
    const result=runResearch(m5,m1,90);
    return NextResponse.json({mode:"five-engine-research",source:"Capital.com",epic,requestedDays:90,m1Coverage:"weekdays 06:00-20:00 UTC (London/New York liquidity window)",...result},{headers:{"X-Robots-Tag":"noindex"}});
  }catch(error){const diagnostic=error instanceof Error?error.message:"UNKNOWN_ERROR";return NextResponse.json({status:"unavailable",error:"Research backtest could not be completed.",diagnostic},{status:502});}
}
