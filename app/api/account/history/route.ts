import { NextRequest, NextResponse } from "next/server";
import { liveSession } from "@/lib/auth/liveSession";
import { customerHistory } from "@/lib/db/sites";

export async function GET(req:NextRequest){
  const session=await liveSession(req);
  if(!session) return NextResponse.json({error:"Authentication required."},{status:401});
  return NextResponse.json({history:await customerHistory(session.email,50)},{headers:{"Cache-Control":"private, no-store"}});
}
