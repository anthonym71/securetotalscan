import { NextRequest, NextResponse } from "next/server";
import { scan } from "@/lib/scanner";
import { monitoredSites, recordCustomerSurfaceScan } from "@/lib/db/sites";
import { sendMonitoringAlertEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret=(process.env.CRON_SECRET??"").trim();
  return Boolean(secret && req.headers.get("authorization")===`Bearer ${secret}`);
}

export async function GET(req:NextRequest){
  if(!authorized(req)) return NextResponse.json({error:"Unauthorized"},{status:401});
  const sites=await monitoredSites();
  let scanned=0, alerted=0, failed=0;
  const failures:string[]=[];

  for(const site of sites){
    try{
      const report=await scan(site.url);
      await recordCustomerSurfaceScan(site.email,report,site.id);
      scanned+=1;
      const degraded =
        (site.previousScore!==null && report.score < site.previousScore) ||
        report.summary.critical > 0;
      if(degraded && site.previousScore!==null){
        const sent=await sendMonitoringAlertEmail(
          site.email,site.url,report.grade,report.score,site.previousGrade,site.previousScore,
        );
        if(sent.delivered) alerted+=1;
      }
    }catch(err){
      failed+=1;
      failures.push(`${site.url}: ${err instanceof Error?err.name:"error"}`);
    }
  }

  return NextResponse.json({ok:failed===0,scanned,alerted,failed,failures:failures.slice(0,10)},{
    status:failed && !scanned?503:200,
    headers:{"Cache-Control":"no-store"},
  });
}
