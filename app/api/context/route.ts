import { NextResponse } from "next/server";
import { getDecisionContext } from "@/lib/decision-context";

export const dynamic="force-dynamic";

export async function GET(){
  try{
    const data=await getDecisionContext();
    return NextResponse.json({ok:true,data},{headers:{"Cache-Control":"no-store, max-age=0","X-Robots-Tag":"noindex"}});
  }catch(error){
    return NextResponse.json({ok:false,error:"context_unavailable",diagnostic:error instanceof Error?error.message:"UNKNOWN_ERROR"},{status:502});
  }
}
