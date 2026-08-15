"use client";

import { useState } from "react";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setMsg("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      if (res.ok) {
        window.location.assign(next.startsWith("/") ? next : "/dashboard");
        return;
      }
      const data = await res.json().catch(() => null);
      setState("error");
      setMsg(data?.error ?? "Sign in failed. Please try again.");
    } catch {
      setState("error");
      setMsg("Network error. Please try again.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm text-white/60">
          Work email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-brand/60"
        />
      </div>
      <div>
        <label htmlFor="code" className="mb-1 block text-sm text-white/60">
          Access code
        </label>
        <input
          id="code"
          type="password"
          required
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Your Pro access code"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-brand/60"
        />
      </div>
      {state === "error" && (
        <p className="text-sm text-grade-f">{msg}</p>
      )}
      <button
        type="submit"
        disabled={state === "sending"}
        className="w-full rounded-xl bg-brand-gradient px-5 py-3 font-semibold text-white disabled:opacity-60"
      >
        {state === "sending" ? "Checking…" : "Enter the dashboard"}
      </button>
      <p className="text-center text-xs text-white/40">
        Deep-agent analysis is a paid capability. Don&apos;t have a code?{" "}
        <a href="/#pricing" className="underline hover:text-white/70">
          See plans
        </a>
        .
      </p>
    </form>
  );
}
