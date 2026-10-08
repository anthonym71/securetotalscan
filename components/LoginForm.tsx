"use client";

import Link from "next/link";
import { useState } from "react";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "error" | "sent">("idle");
  const [msg, setMsg] = useState("");

  async function sendMagicLink() {
    if (state === "sending") return;
    setState("sending");
    setMsg("");
    try {
      const res = await fetch("/api/auth/magic/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) throw new Error("request failed");
      setState("sent");
      setMsg("If that email has an active paid plan, a secure sign-in link is on its way.");
    } catch {
      setState("error");
      setMsg("Could not send the sign-in link. Please try again.");
    }
  }

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
      {state === "sent" && (
        <p className="text-sm text-brand-light">{msg}</p>
      )}
      <button
        type="submit"
        disabled={state === "sending"}
        className="w-full rounded-xl bg-brand-gradient px-5 py-3 font-semibold text-white disabled:opacity-60"
      >
        {state === "sending" ? "Checking…" : "Enter with access code"}
      </button>
      <button
        type="button"
        onClick={sendMagicLink}
        disabled={state === "sending" || !email.trim()}
        className="w-full rounded-xl border border-brand/40 px-5 py-3 font-semibold text-brand-light disabled:opacity-40"
      >
        Email me a secure sign-in link
      </button>
      <p className="text-center text-xs text-white/40">
        Paid customers can use the email link above. Don&apos;t have a plan?{" "}
        <Link href="/#pricing" className="underline hover:text-white/70">
          See plans
        </Link>
        .
      </p>
    </form>
  );
}
