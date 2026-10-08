"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Site={id:string;url:string;label:string|null;group:string|null;latestGrade?:string|null;latestScore?:number|null;latestScanAt?:string|null};
type History={id:string;url:string;grade:string|null;score:number|null;createdAt:string;expiresAt:string};

export default function AccountPage(){
  const [sites,setSites]=useState<Site[]>([]);
  const [history,setHistory]=useState<History[]>([]);
  const [url,setUrl]=useState("");
  const [label,setLabel]=useState("");
  const [message,setMessage]=useState("");

  async function load(){
    const [s,h]=await Promise.all([fetch("/api/account/sites",{cache:"no-store"}),fetch("/api/account/history",{cache:"no-store"})]);
    if(s.ok)setSites((await s.json()).sites??[]);
    if(h.ok)setHistory((await h.json()).history??[]);
  }
  useEffect(()=>{void load();},[]);

  async function add(e:React.FormEvent){
    e.preventDefault();setMessage("");
    const res=await fetch("/api/account/sites",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url,label})});
    if(!res.ok){const b=await res.json().catch(()=>({}));setMessage(b.error??"Could not save site.");return;}
    setUrl("");setLabel("");setMessage("Site saved. Monitoring runs about monthly for eligible paid plans.");await load();
  }
  async function remove(id:string){
    const res=await fetch("/api/account/sites",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})});
    if(res.ok)await load();
  }

  return <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-sm text-white/50">Secure Total Scan</p><h1 className="text-3xl font-bold">My security account</h1></div>
      <div className="flex gap-4 text-sm"><Link href="/dashboard" className="underline">Deep analysis</Link><Link href="/" className="underline">Free scan</Link></div>
    </div>

    <section className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-xl font-semibold">Saved sites & monitoring</h2>
      <form onSubmit={add} className="mt-4 grid gap-3 md:grid-cols-[1fr_220px_auto]">
        <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://your-site.com" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3" required/>
        <input value={label} onChange={e=>setLabel(e.target.value)} placeholder="Label (optional)" className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"/>
        <button className="rounded-xl bg-brand-gradient px-5 py-3 font-semibold">Save site</button>
      </form>
      {message&&<p className="mt-3 text-sm text-white/60">{message}</p>}
      <div className="mt-6 grid gap-3">
        {sites.length===0&&<p className="text-white/50">No saved sites yet.</p>}
        {sites.map(s=><div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4">
          <div><p className="font-semibold">{s.label||s.url}</p><p className="text-sm text-white/50">{s.url}</p></div>
          <div className="flex items-center gap-4 text-sm">
            <span>{s.latestGrade?(s.latestGrade+" / "+String(s.latestScore??"—")):"Awaiting monitored scan"}</span>
            <button onClick={()=>void remove(s.id)} className="text-grade-f">Remove</button>
          </div>
        </div>)}
      </div>
    </section>

    <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-xl font-semibold">Scan history</h2>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm">
        <thead className="text-white/50"><tr><th className="py-2">Date</th><th>Target</th><th>Grade</th><th>Score</th></tr></thead>
        <tbody>{history.map(h=><tr key={h.id} className="border-t border-white/10"><td className="py-3">{new Date(h.createdAt).toLocaleDateString()}</td><td>{h.url}</td><td>{h.grade??"—"}</td><td>{h.score??"—"}</td></tr>)}</tbody>
      </table>{history.length===0&&<p className="py-4 text-white/50">No account scans recorded yet.</p>}</div>
    </section>
  </main>;
}
