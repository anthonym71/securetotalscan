import { BRAND } from "@/lib/brand";
import {
  AGENTS,
  HERO,
  HOW_IT_WORKS,
  PLANS,
  SCAN_FEATURES,
  SCAN_SECTION,
  STATS,
  STATS_CALLOUT,
  TRUST,
} from "@/lib/content";

// GHL hosted checkout for the Pro subscription ($49/mo). Public link, safe to inline.
const PRO_CHECKOUT_URL =
  "https://link.ifactoryusa.com/payment-link/6a2e744a03b17c94f5716342";

export function NavBar() {
  return (
    <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
      <a href="#" className="flex items-center gap-2 font-bold">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-gradient text-sm">
          🛡️
        </span>
        <span className="text-lg tracking-tight">{BRAND.name}</span>
      </a>
      <div className="flex items-center gap-3">
        <a href="#pricing" className="hidden text-sm text-white/70 hover:text-white sm:block">
          Pricing
        </a>
        <a
          href="#scan"
          className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium transition hover:border-brand/50 hover:bg-white/5"
        >
          Run scan
        </a>
      </div>
    </nav>
  );
}

export function Hero() {
  return (
    <header className="relative mx-auto max-w-5xl px-6 pt-10 pb-6 text-center sm:pt-16">
      <span className="inline-block rounded-full border border-brand/40 bg-brand/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-brand-light">
        {HERO.eyebrow}
      </span>
      <h1 className="mt-6 text-4xl font-extrabold leading-tight sm:text-6xl">
        {HERO.title[0]}
        <br />
        <span className="bg-brand-gradient bg-clip-text text-transparent">
          {HERO.title[1]}
        </span>
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-xl font-semibold text-white/90">
        {HERO.subtitle}
      </p>
      <p className="mx-auto mt-4 max-w-2xl text-lg text-white/60">{HERO.body}</p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <a
          href="#scan"
          className="inline-block rounded-xl bg-brand-gradient px-8 py-4 font-semibold shadow-glow transition hover:opacity-90"
        >
          {HERO.cta}
        </a>
        <a
          href={PRO_CHECKOUT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-xl border border-brand/50 px-8 py-4 font-semibold text-brand-light transition hover:bg-brand/10"
        >
          Get Pro — $49/mo
        </a>
      </div>
    </header>
  );
}

export function TrustBar() {
  return (
    <section className="mx-auto max-w-3xl px-6">
      <div className="flex items-start gap-4 rounded-2xl border border-brand/30 bg-brand/10 p-5">
        <span className="mt-0.5 text-2xl" aria-hidden>
          🔐
        </span>
        <div>
          <p className="font-semibold text-white">{TRUST.headline}</p>
          <p className="mt-1 text-sm leading-relaxed text-white/70">{TRUST.body}</p>
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <h2 className="text-center text-3xl font-bold sm:text-4xl">How it works</h2>
      <div className="mt-10 grid gap-5 sm:grid-cols-3">
        {HOW_IT_WORKS.map((s, i) => (
          <div
            key={s.title}
            className="rounded-2xl border border-white/10 bg-card-gradient p-6"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{s.icon}</span>
              <span className="text-sm font-medium text-brand-light">
                Step {i + 1}
              </span>
            </div>
            <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm text-white/60">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function WhatWeScan() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="text-center">
        <h2 className="text-3xl font-bold sm:text-4xl">What the free scan checks</h2>
        <p className="mx-auto mt-3 max-w-2xl text-white/60">
          A passive surface scan. No login, no agents, no waiting.
        </p>
      </div>
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {SCAN_FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-white/10 bg-card-gradient p-6 transition hover:border-brand/40"
          >
            <div className="text-3xl">{f.icon}</div>
            <h3 className="mt-3 text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-white/60">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Agents() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="text-center">
        <h2 className="text-3xl font-bold sm:text-4xl">The agents inside</h2>
        <p className="mx-auto mt-3 max-w-2xl text-white/60">
          Go past the surface. Five autonomous agents plus a cost-control layer
          run the deep analysis.
        </p>
      </div>
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {AGENTS.map((a) => (
          <div
            key={a.title}
            className="rounded-2xl border border-white/10 bg-card-gradient p-6 transition hover:border-brand/40"
          >
            <div className="text-3xl">{a.icon}</div>
            <h3 className="mt-3 text-lg font-semibold">{a.title}</h3>
            <p className="mt-2 text-sm text-white/60">{a.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 text-center">
        <a
          href="/dashboard"
          className="inline-block rounded-xl border border-brand/50 px-8 py-4 font-semibold text-brand-light transition hover:bg-brand/10"
        >
          Open the agent dashboard →
        </a>
      </div>
    </section>
  );
}

export function Stats() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="text-center">
        <h2 className="text-3xl font-bold sm:text-4xl">The numbers don&apos;t lie</h2>
        <p className="mx-auto mt-3 max-w-2xl text-white/60">
          AI-generated code has a security problem. Here&apos;s the latest research.
        </p>
      </div>
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-white/10 bg-card-gradient p-6 text-center"
          >
            <div className="bg-brand-gradient bg-clip-text text-4xl font-extrabold text-transparent">
              {s.value}
            </div>
            <p className="mt-3 text-sm text-white/70">{s.label}</p>
            <p className="mt-2 text-xs uppercase tracking-wide text-white/40">
              {s.source}
            </p>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-12 max-w-2xl text-center text-xl font-semibold">
        {STATS_CALLOUT}
      </p>
    </section>
  );
}

export function Plans() {
  return (
    <section id="pricing" className="mx-auto max-w-5xl px-6 py-16">
      <h2 className="text-center text-3xl font-bold sm:text-4xl">Plans</h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-white/60">
        Start free. Upgrade when you want the agents watching around the clock.
      </p>
      <div className="mt-10 grid gap-5 sm:grid-cols-3">
        {PLANS.map((p) => (
          <div
            key={p.name}
            className={`rounded-2xl border p-6 ${
              p.featured
                ? "border-brand bg-brand/10 shadow-glow"
                : "border-white/10 bg-card-gradient"
            }`}
          >
            {p.featured && (
              <span className="mb-3 inline-block rounded-full bg-brand-gradient px-3 py-1 text-xs font-semibold">
                Most popular
              </span>
            )}
            <h3 className="text-lg font-semibold">{p.name}</h3>
            <div className="mt-2 text-3xl font-extrabold">
              {p.price}
              {p.cadence && (
                <span className="text-base font-normal text-white/40">
                  {p.cadence}
                </span>
              )}
            </div>
            <ul className="mt-4 space-y-2 text-sm text-white/70">
              {p.features.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-brand-light">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <a
              href={
                p.name === "Pro"
                  ? PRO_CHECKOUT_URL
                  : p.name === "Organization"
                    ? `mailto:${BRAND.email}`
                    : "#scan"
              }
              target={p.name === "Pro" ? "_blank" : undefined}
              rel={p.name === "Pro" ? "noopener noreferrer" : undefined}
              className={`mt-6 block rounded-xl px-5 py-3 text-center font-semibold transition ${
                p.featured
                  ? "bg-brand-gradient hover:opacity-90"
                  : "border border-white/15 hover:bg-white/5"
              }`}
            >
              {p.name === "Free" ? "Start free" : p.name === "Pro" ? "Go Pro" : "Contact us"}
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
