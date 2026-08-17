"use client";

import { useState } from "react";

export function LeadCapture({
  url,
  grade,
  score,
  defaultEmail = "",
}: {
  url: string;
  grade: string;
  score: number;
  /** Address the scan was run with, so it does not have to be typed twice. */
  defaultEmail?: string;
}) {
  const [email, setEmail] = useState(defaultEmail);
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
        {/* This said "Your report is on its way. Check your inbox." No email
            is sent — /api/lead creates a CRM contact and nothing else. Report
            delivery ships in PR 2.5; until then the confirmation says what
            actually happened. */}
        <p className="font-semibold text-grade-a">You&apos;re on the list.</p>
        <p className="mt-1 text-sm text-white/60">
          Emailed PDF reports are launching shortly and you&apos;ll be among the
          first to get one. In the meantime every finding is on this page — copy
          anything you need before you close it.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-brand/30 bg-brand/10 p-5">
      <p className="font-semibold">Get the PDF report when it launches</p>
      <p className="mt-1 text-sm text-white/60">
        Emailed PDF reports are not live yet. Leave your address and we&apos;ll
        send yours as soon as they are, along with occasional security updates.
        No spam, unsubscribe any time.
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
          {state === "sending" ? "Saving…" : "Notify me"}
        </button>
      </form>
      {state === "error" && (
        <p className="mt-2 text-sm text-grade-f">{msg}</p>
      )}
    </div>
  );
}
