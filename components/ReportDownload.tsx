"use client";
import { useState } from "react";

export function ReportDownload({ id, token }: { id: string; token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/report/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Download failed. Please try again.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = `secure-total-scan-${id}.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) { setError(err instanceof Error ? err.message : "Download failed."); }
    finally { setBusy(false); }
  }
  return <div>
    <button onClick={download} disabled={busy} className="rounded-xl border border-brand/50 px-5 py-3 font-semibold disabled:opacity-50">
      {busy ? "Preparing PDF…" : "Download PDF report"}
    </button>
    {error && <p role="alert" className="mt-2 text-sm text-grade-f">{error}</p>}
  </div>;
}
