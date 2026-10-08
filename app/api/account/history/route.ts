import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { customerHistory } from "@/lib/db/sites";

export async function GET(req:NextRequest){
  const session=await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if(!session) return NextResponse.json({error:"Authentication required."},{status:401});
  return NextResponse.json({history:await customerHistory(session.email,50)},{headers:{"Cache-Control":"private, no-store"}});
}
