import { NextResponse } from "next/server";
import { getLiveQuote } from "@/lib/capital";

export const dynamic="force-dynamic";

export async function GET(){
  try{
    const data=await getLiveQuote();
    return NextResponse.json(data,{headers:{"Cache-Control":"no-store, max-age=0"}});
  }catch(error){
    return NextResponse.json({error:"quote_unavailable",diagnostic:error instanceof Error?error.message:"UNKNOWN_ERROR"},{status:502});
  }
}
