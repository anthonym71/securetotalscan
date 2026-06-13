"use client";

import { useState } from "react";
import type { ScanReport } from "@/lib/scanner/types";
import { SCAN_SECTION } from "@/lib/content";
import { ScanResults } from "./ScanResults";

const PHASES = [
  "Fetching your app…",
  "Reading response headers…",
  "Scanning JavaScript bundles for secrets…",
  "Probing for exposed files…",
  "Checking CORS and SSL…",
  "Grading results…",
];

export function ScanForm() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ScanReport | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || loading) return;

    setLoading(true);
    setError(null);
    setReport(null);

    // Animate phase labels while the scan runs.
    let p = 0;
    const interval = setInterval(() => {
      p = Math.min(p + 1, PHASES.length - 1);
      setPhase(p);
    }, 900);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
      } else {
        setReport(data as ScanReport);
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      clearInterval(interval);
      setLoading(false);
      setPhase(0);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-card-gradient p-3 sm:flex-row"
      >
        <input
          type="url"
          name="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={SCAN_SECTION.placeholder}
          className="flex-1 rounded-xl bg-black/40 px-4 py-3.5 text-white placeholder-white/30 outline-none ring-brand/50 transition focus:ring-2"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-brand-gradient px-7 py-3.5 font-semibold text-white shadow-glow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Scanning…" : SCAN_SECTION.button}
        </button>
      </form>

      <p className="mt-3 text-center text-sm text-white/40">
        {SCAN_SECTION.supports}
      </p>

      {loading && (
        <div className="mt-6 flex items-center justify-center gap-3 text-white/70">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-brand-light" />
          <span className="animate-pulse">{PHASES[phase]}</span>
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-xl border border-grade-f/30 bg-grade-f/10 px-4 py-3 text-center text-grade-f">
          {error}
        </div>
      )}

      {report && <ScanResults report={report} />}
    </div>
  );
}
