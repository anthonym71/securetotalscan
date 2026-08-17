"use client";

import { useState } from "react";
import type { ScanReport } from "@/lib/scanner/types";
import { SCAN_SECTION } from "@/lib/content";
import {
  type Protocol,
  normalizeTarget,
  protocolFrom,
  targetError,
} from "@/lib/scanner/target";
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
  // HTTPS by default: it is what almost every target uses, and defaulting to
  // http would quietly scan the wrong origin on any site that redirects.
  const [protocol, setProtocol] = useState<Protocol>("https:");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ScanReport | null>(null);
  // The address the report was actually run for, so the report form can carry
  // it forward rather than asking for it twice.
  const [scannedEmail, setScannedEmail] = useState("");

  // Live, non-blocking. `null` while the field is empty — a blank input is not
  // yet wrong, and complaining before anything is typed makes a form feel
  // broken.
  const urlProblem = targetError(url, protocol);

  function onUrlChange(next: string) {
    setUrl(next);
    // If someone pastes a full URL, the scheme they pasted wins and the
    // selector follows it, so the control never disagrees with the field.
    const pasted = protocolFrom(next);
    if (pasted && pasted !== protocol) setProtocol(pasted);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || !email.trim() || loading) return;

    // Catch a bad target before spending a request and a scan credit on it.
    // The server re-validates; this is convenience, not a security boundary.
    let target: string;
    try {
      target = normalizeTarget(url, protocol).toString();
    } catch {
      setError(urlProblem ?? "That doesn't look like a valid URL.");
      return;
    }

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
        body: JSON.stringify({ url: target, email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
      } else {
        setReport(data as ScanReport);
        setScannedEmail(email.trim());
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
        <div className="flex flex-1 items-stretch overflow-hidden rounded-xl bg-black/40 focus-within:ring-2 focus-within:ring-brand/50">
          <label className="sr-only" htmlFor="scan-protocol">
            Protocol
          </label>
          <select
            id="scan-protocol"
            value={protocol}
            onChange={(e) => setProtocol(e.target.value as Protocol)}
            disabled={loading}
            className="cursor-pointer border-r border-white/10 bg-transparent py-3.5 pl-4 pr-2 text-sm text-white/60 outline-none"
          >
            <option value="https:">https://</option>
            <option value="http:">http://</option>
          </select>
          <input
            // Deliberately not type="url": that rejects a bare domain in the
            // browser even though the server accepts one, so `example.com` —
            // the most natural thing to type — was blocked before it was ever
            // sent. Validation is mirrored from the server instead.
            type="text"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            name="url"
            required
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder={SCAN_SECTION.placeholder}
            aria-invalid={urlProblem ? true : undefined}
            aria-describedby={urlProblem ? "scan-url-error" : undefined}
            className="min-w-0 flex-1 bg-transparent px-3 py-3.5 text-white placeholder-white/30 outline-none"
            disabled={loading}
          />
        </div>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          aria-label="Email address for your scan report"
          className="flex-1 rounded-xl bg-black/40 px-4 py-3.5 text-white placeholder-white/30 outline-none ring-brand/50 transition focus:ring-2 sm:max-w-[15rem]"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || Boolean(urlProblem)}
          className="rounded-xl bg-brand-gradient px-7 py-3.5 font-semibold text-white shadow-glow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Scanning…" : SCAN_SECTION.button}
        </button>
      </form>

      {urlProblem && (
        <p id="scan-url-error" className="mt-2 text-center text-sm text-grade-d">
          {urlProblem}
        </p>
      )}

      <p className="mt-3 text-center text-sm text-white/40">
        {SCAN_SECTION.supports}
      </p>
      {/* The previous wording promised "we email your report", which is not
          true yet — report delivery ships in Phase 2. Narrowed to what the
          address is actually used for today. */}
      <p className="mt-1 text-center text-xs text-white/30">
        We&apos;ll email you occasional security tips. Unsubscribe any time.
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

      {report && <ScanResults report={report} email={scannedEmail} />}
    </div>
  );
}
