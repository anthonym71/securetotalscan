import { db } from "./client";
import type { ScanReport } from "../scanner/types";
import { reportForStorage } from "./scans";

export interface SavedSite {
  id: string;
  url: string;
  label: string | null;
  group: string | null;
  createdAt: string;
  latestGrade?: string | null;
  latestScore?: number | null;
  latestScanAt?: string | null;
}

export async function customerIdForEmail(email: string): Promise<string | null> {
  const rows = await db().query(
    `SELECT id FROM customer WHERE lower(email)=lower($1) LIMIT 1`,
    [email], { arrayMode: false, fullResults: false },
  );
  if (!Array.isArray(rows) || !rows[0] || Array.isArray(rows[0])) return null;
  return String(rows[0].id);
}

export async function listSites(email: string): Promise<SavedSite[]> {
  const rows = await db().query(
    `SELECT s.id, s.url, s.label, s.site_group, s.created_at,
            latest.grade, latest.score, latest.created_at AS latest_scan_at
       FROM site s
       JOIN customer c ON c.id=s.customer_id
       LEFT JOIN LATERAL (
         SELECT grade, score, created_at FROM scan
          WHERE site_id=s.id ORDER BY created_at DESC LIMIT 1
       ) latest ON true
      WHERE lower(c.email)=lower($1)
      ORDER BY s.created_at DESC`,
    [email], { arrayMode: false, fullResults: false },
  );
  if (!Array.isArray(rows)) return [];
  return rows.filter(r=>!Array.isArray(r)).map(r=>({
    id:String(r.id), url:String(r.url), label:r.label ? String(r.label):null,
    group:r.site_group ? String(r.site_group):null,
    createdAt:new Date(r.created_at).toISOString(),
    latestGrade:r.grade == null ? null : String(r.grade),
    latestScore:r.score == null ? null : Number(r.score),
    latestScanAt:r.latest_scan_at == null ? null : new Date(r.latest_scan_at).toISOString(),
  }));
}

export async function addSite(email: string, url: string, label?: string, group?: string): Promise<SavedSite> {
  const rows=await db().query(
    `INSERT INTO site (customer_id,url,label,site_group)
     SELECT id,$2,$3,$4 FROM customer WHERE lower(email)=lower($1)
     ON CONFLICT (customer_id,url)
     DO UPDATE SET label=EXCLUDED.label,site_group=EXCLUDED.site_group,updated_at=now()
     RETURNING id,url,label,site_group,created_at`,
    [email,url,label||null,group||null], {arrayMode:false,fullResults:false},
  );
  if(!Array.isArray(rows)||!rows[0]||Array.isArray(rows[0])) throw new Error("Unable to save site");
  const r=rows[0];
  return {id:String(r.id),url:String(r.url),label:r.label?String(r.label):null,group:r.site_group?String(r.site_group):null,createdAt:new Date(r.created_at).toISOString()};
}

export async function deleteSite(email:string,id:string):Promise<boolean>{
  const rows=await db().query(
    `DELETE FROM site s USING customer c
      WHERE s.id=$2::uuid AND s.customer_id=c.id AND lower(c.email)=lower($1)
      RETURNING s.id`,
    [email,id],{arrayMode:false,fullResults:false},
  );
  return Array.isArray(rows)&&rows.length>0;
}

export async function customerHistory(email:string,limit=50){
  const rows=await db().query(
    `SELECT sc.id,sc.target_url,sc.grade,sc.score,sc.created_at,sc.expires_at,sc.site_id
       FROM scan sc JOIN customer c ON c.id=sc.customer_id
      WHERE lower(c.email)=lower($1)
      ORDER BY sc.created_at DESC LIMIT $2`,
    [email,Math.min(Math.max(limit,1),100)],{arrayMode:false,fullResults:false},
  );
  if(!Array.isArray(rows)) return [];
  return rows.filter(r=>!Array.isArray(r)).map(r=>({
    id:String(r.id),url:String(r.target_url),grade:r.grade?String(r.grade):null,
    score:r.score==null?null:Number(r.score),siteId:r.site_id?String(r.site_id):null,
    createdAt:new Date(r.created_at).toISOString(),expiresAt:new Date(r.expires_at).toISOString(),
  }));
}

export async function recordCustomerSurfaceScan(email:string,report:ScanReport,siteId?:string|null){
  const stored=reportForStorage(report);
  const rows=await db().query(
    `INSERT INTO scan (customer_id,site_id,target_url,target_host,kind,grade,score,findings,duration_ms)
     SELECT c.id,$2::uuid,$3,$4,'surface',$5,$6,$7::jsonb,$8
       FROM customer c WHERE lower(c.email)=lower($1)
     RETURNING id,created_at,expires_at`,
    [email,siteId||null,stored.url,new URL(stored.url).hostname.toLowerCase(),stored.grade,stored.score,JSON.stringify(stored),stored.durationMs],
    {arrayMode:false,fullResults:false},
  );
  if(!Array.isArray(rows)||!rows[0]||Array.isArray(rows[0])) throw new Error("Customer scan storage failed");
  return {id:String(rows[0].id),createdAt:new Date(rows[0].created_at).toISOString(),expiresAt:new Date(rows[0].expires_at).toISOString()};
}

export async function monitoredSites(){
  const rows=await db().query(
    `SELECT s.id,s.url,c.email,
            latest.score AS previous_score,latest.grade AS previous_grade,
            latest.created_at AS previous_scan_at
       FROM site s
       JOIN customer c ON c.id=s.customer_id
       JOIN subscription sub ON sub.customer_id=c.id
        AND sub.status='active' AND sub.tier IN ('pro','business')
        AND (sub.renews_on IS NULL OR sub.renews_on>=current_date)
       LEFT JOIN LATERAL (
         SELECT score,grade,created_at FROM scan WHERE site_id=s.id ORDER BY created_at DESC LIMIT 1
       ) latest ON true
      WHERE latest.created_at IS NULL OR latest.created_at < now()-interval '30 days'
      ORDER BY COALESCE(latest.created_at,'1970-01-01'::timestamptz)
      LIMIT 100`,
    [],{arrayMode:false,fullResults:false},
  );
  return Array.isArray(rows)?rows.filter(r=>!Array.isArray(r)).map(r=>({
    id:String(r.id),url:String(r.url),email:String(r.email),
    previousScore:r.previous_score==null?null:Number(r.previous_score),
    previousGrade:r.previous_grade==null?null:String(r.previous_grade),
  })):[];
}
