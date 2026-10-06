import { NextResponse } from "next/server";
import { getSystemHealth } from "@/lib/shadow-recorder";

export const dynamic="force-dynamic";

export async function GET(){
  try{
    const data=await getSystemHealth();
    return NextResponse.json({
      ok:true,
      health:data?.health??null,
      aiConfigured:!!process.env.GROQ_API_KEY
    },{headers:{"Cache-Control":"no-store, max-age=0","X-Robots-Tag":"noindex"}});
  }catch(error){
    return NextResponse.json({ok:false,aiConfigured:!!process.env.GROQ_API_KEY,error:error instanceof Error?error.message:"UNKNOWN_ERROR"},{status:502});
  }
}
