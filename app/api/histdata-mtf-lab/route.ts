import {NextResponse} from "next/server";
import {getHistDataForLab} from "@/lib/histdata";
import {runMtfTrendPullbackLab} from "@/lib/mtf-trend-pullback-lab";
export const dynamic="force-dynamic";export const maxDuration=60;
export async function GET(req:Request){try{
  const u=new URL(req.url),year=Number(u.searchParams.get("year")||2022);
  if(!Number.isInteger(year)||year<2012||year>2025)return NextResponse.json({status:"bad_year"},{status:400});
  const h=await getHistDataForLab(year),result=runMtfTrendPullbackLab(h.m5,h.daily,365);
  return NextResponse.json({mode:"histdata-mtf-lab",source:"HistData.com",testYear:year,histdata:{rawMinutes:h.rawMinutes,from:h.from,to:h.to,timezone:"EST fixed; normalized to UTC +05:00 before aggregation"},...result},{headers:{"X-Robots-Tag":"noindex","Cache-Control":"no-store"}});
}catch(e){return NextResponse.json({status:"unavailable",diagnostic:e instanceof Error?e.message:"UNKNOWN_ERROR"},{status:502})}}
