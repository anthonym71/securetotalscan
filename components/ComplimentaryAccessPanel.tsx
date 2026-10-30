"use client";

import { useCallback, useEffect, useState } from "react";

type Grant = { email: string; tier: string; renewsOn: string | null; grantedAt: string };

const DURATIONS: { id: string; label: string }[] = [
  { id: "day", label: "1 day" },
  { id: "week", label: "1 week" },
  { id: "month", label: "1 month" },
  { id: "year", label: "1 year" },
  { id: "always", label: "Always" },
];

const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-brand/60";

export function ComplimentaryAccessPanel() {
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState("pro");
  const [duration, setDuration] = useState("month");
  const [grants, setGrants] = useState<Grant[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/owner/grants", { cache: "no-store" });
    if (res.ok) setGrants(((await res.json()) as { grants?: Grant[] }).grants ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/owner/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), tier, duration }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; grant?: Grant };
      if (!res.ok) {
        setMessage({ kind: "error", text: data.error ?? "Could not grant access." });
        return;
      }
      const until = data.grant?.renewsOn ? `until ${data.grant.renewsOn}` : "with no end date";
      setMessage({ kind: "ok", text: `${data.grant?.email} now has ${tier} access ${until}. They can sign in with the email link.` });
      setEmail("");
      await load();
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(target: string) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/owner/grants", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMessage(
        res.ok
          ? { kind: "ok", text: `Complimentary access for ${target} revoked.` }
          : { kind: "error", text: data.error ?? "Could not revoke access." },
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-8">
      <h2 className="text-lg font-semibold">Complimentary access</h2>
      <p className="mt-1 text-sm text-white/60">
        Grant paid-tier access with no charge. The customer signs in with the
        email link as usual. Granting again for the same email replaces the
        previous period.
      </p>

      <form onSubmit={grant} className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <div>
          <label htmlFor="grant-email" className="mb-1 block text-sm text-white/60">Email</label>
          <input
            id="grant-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="customer@company.com"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="grant-tier" className="mb-1 block text-sm text-white/60">Tier</label>
          <select id="grant-tier" value={tier} onChange={(e) => setTier(e.target.value)} className={inputClass}>
            <option value="pro">Pro</option>
            <option value="business">Business</option>
          </select>
        </div>
        <div>
          <label htmlFor="grant-duration" className="mb-1 block text-sm text-white/60">Duration</label>
          <select id="grant-duration" value={duration} onChange={(e) => setDuration(e.target.value)} className={inputClass}>
            {DURATIONS.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="rounded-xl bg-brand-gradient px-5 py-3 font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Working…" : "Grant access"}
        </button>
      </form>

      {message && (
        <p className={`mt-4 text-sm ${message.kind === "ok" ? "text-brand-light" : "text-grade-f"}`}>
          {message.text}
        </p>
      )}

      <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-white/50">Active grants</h3>
      {grants.length === 0 ? (
        <p className="mt-2 text-sm text-white/40">None yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-white/10">
          {grants.map((g) => (
            <li key={g.email} className="flex items-center justify-between gap-4 py-3 text-sm">
              <div>
                <span className="font-medium">{g.email}</span>
                <span className="ml-2 rounded-full border border-white/15 px-2 py-0.5 text-xs uppercase text-white/70">{g.tier}</span>
                <span className="ml-2 text-white/50">{g.renewsOn ? `until ${g.renewsOn}` : "no end date"}</span>
              </div>
              <button
                type="button"
                onClick={() => revoke(g.email)}
                disabled={busy}
                className="rounded-lg border border-grade-f/40 px-3 py-1 text-xs text-grade-f hover:bg-grade-f/10 disabled:opacity-40"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
