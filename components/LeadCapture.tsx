"use client";

import { useState } from "react";

export function LeadCapture({
  url,
  grade,
  score,
}: {
  url: string;
  grade: string;
  score: number;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || state === "sending") return;
    setState("sending");
    setMsg("");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), url, grade, score }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setState("done");
      } else {
        setState("error");
        setMsg(data?.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setState("error");
      setMsg("Network error. Please try again.");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-2xl border border-grade-a/30 bg-grade-a/10 p-5 text-center">
        <p className="font-semibold text-grade-a">Your report is on its way.</p>
        <p className="mt-1 text-sm text-white/60">
          Check your inbox, we&apos;ll send the full breakdown and fix steps shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-brand/30 bg-brand/10 p-5">
      <p className="font-semibold">Get the full report as a PDF</p>
      <p className="mt-1 text-sm text-white/60">
        We&apos;ll email you the complete breakdown with every finding and a fix
        prompt for each. No spam.
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="flex-1 rounded-xl bg-black/40 px-4 py-3 text-white placeholder-white/30 outline-none ring-brand/50 transition focus:ring-2"
          disabled={state === "sending"}
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className="rounded-xl bg-brand-gradient px-6 py-3 font-semibold transition hover:opacity-90 disabled:opacity-60"
        >
          {state === "sending" ? "Sending…" : "Email me the report"}
        </button>
      </form>
      {state === "error" && (
        <p className="mt-2 text-sm text-grade-f">{msg}</p>
      )}
    </div>
  );
}
