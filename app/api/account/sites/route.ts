import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { addSite, deleteSite, listSites } from "@/lib/db/sites";
import { normalizeTarget, ScanError } from "@/lib/scanner";
import { assertSameOrigin } from "@/lib/security/origin";

async function sessionFor(req:NextRequest){
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value);
}

export async function GET(req:NextRequest){
  const session=await sessionFor(req);
  if(!session) return NextResponse.json({error:"Authentication required."},{status:401});
  return NextResponse.json({sites:await listSites(session.email)},{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(req:NextRequest){
  const originError=assertSameOrigin(req); if(originError) return originError;
  const session=await sessionFor(req);
  if(!session) return NextResponse.json({error:"Authentication required."},{status:401});
  const body=await req.json().catch(()=>null) as {url?:unknown;label?:unknown;group?:unknown}|null;
  if(typeof body?.url!=="string") return NextResponse.json({error:"URL required."},{status:400});
  let target:URL;
  try{target=normalizeTarget(body.url);}catch(err){
    return NextResponse.json({error:err instanceof ScanError?err.message:"Invalid URL."},{status:422});
  }
  const label=typeof body.label==="string"?body.label.trim().slice(0,100):"";
  const group=typeof body.group==="string"?body.group.trim().slice(0,100):"";
  const site=await addSite(session.email,target.toString(),label,group);
  return NextResponse.json({site},{status:201,headers:{"Cache-Control":"private, no-store"}});
}

export async function DELETE(req:NextRequest){
  const originError=assertSameOrigin(req); if(originError) return originError;
  const session=await sessionFor(req);
  if(!session) return NextResponse.json({error:"Authentication required."},{status:401});
  const body=await req.json().catch(()=>null) as {id?:unknown}|null;
  if(typeof body?.id!=="string"||!/^[0-9a-f-]{36}$/i.test(body.id)) return NextResponse.json({error:"Invalid site id."},{status:400});
  const deleted=await deleteSite(session.email,body.id);
  return deleted?NextResponse.json({deleted:true}):NextResponse.json({error:"Site not found."},{status:404});
}
