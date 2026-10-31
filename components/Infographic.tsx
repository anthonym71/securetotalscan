import { STATS } from "@/lib/content";

// HTML replacement for the old infographic PNG
// (public/AI-Powered_Web_Defense_Platform.png). Built from the same STATS and
// agent list the rest of the site uses, so the numbers and claims can never
// drift from the product, and the model wording stays "the latest models"
// rather than naming a version that goes stale.

const STEPS = [
  {
    n: "1",
    title: "Free Surface Scan",
    body: "An instant passive check of headers, secrets, CORS and SSL gives an initial A–F security grade. No login.",
  },
  {
    n: "2",
    title: "Deep Agent Analysis",
    body: "Autonomous agents inspect code, logs, threats and compliance gaps to find what a passive scan misses.",
  },
  {
    n: "3",
    title: "Fix and Monitor",
    body: "You get exact copy-paste fix prompts for every finding, then can schedule continuous monitoring.",
  },
];

const AGENTS = [
  { icon: "📝", name: "Log Monitor", body: "Ingests system and example logs to flag anomalies and score severity from low to critical." },
  { icon: "🎯", name: "Threat Intel Agent", body: "Maps live threat indicators against DDoS patterns and MITRE ATT&CK frameworks." },
  { icon: "🐛", name: "Vulnerability Scanner", body: "Searches repos and surfaces for leaked API keys, hardcoded credentials and injection risks." },
  { icon: "🚑", name: "Incident Response Agent", body: "Matches findings against known CVEs and gives prioritised remediation recommendations." },
  { icon: "📋", name: "Compliance Agent", body: "Checks infrastructure gaps against NIST CSF and SOC 2 regulatory controls." },
];

const ARCHITECTURE = [
  { icon: "🔒", title: "Zero Persistence Policy", body: "Fetched pages and bundles are analysed and not stored with the report. Your data is never used to train models." },
  { icon: "💰", title: "LLM Cost Control", body: "A dedicated caching layer drives repeat-scan token cost toward zero, and every token is tracked." },
  { icon: "🧱", title: "Tech Stack", body: "Built with React, Tailwind CSS and a FastAPI orchestration layer, utilizing the latest models via OpenRouter." },
];

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-card-gradient p-5 ${className}`}>
      {children}
    </div>
  );
}

export function Infographic() {
  return (
    <div className="bg-[#0a0e1a] px-6 py-10 sm:px-10">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-extrabold sm:text-4xl">
          Secure Total Scan
        </h2>
        <p className="mt-1 bg-brand-gradient bg-clip-text text-base font-semibold text-transparent sm:text-lg">
          Autonomous AI Defense for the Modern Web
        </p>
      </div>

      {/* The AI security gap */}
      <section className="mt-10">
        <h3 className="text-sm font-bold uppercase tracking-[0.25em] text-brand-light">
          The AI Security Gap
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {STATS.slice(0, 3).map((s) => (
            <Card key={s.value}>
              <p className="text-3xl font-extrabold text-grade-f">{s.value}</p>
              <p className="mt-1 text-sm text-white/80">{s.label}.</p>
              <p className="mt-2 text-xs text-white/40">{s.source}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mt-10">
        <h3 className="text-sm font-bold uppercase tracking-[0.25em] text-brand-light">
          How It Works: From Scan to Fix
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step) => (
            <Card key={step.n}>
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-brand-gradient text-sm font-bold">
                  {step.n}
                </span>
                <p className="font-semibold">{step.title}</p>
              </div>
              <p className="mt-2 text-sm text-white/70">{step.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* The 5 autonomous agents */}
      <section className="mt-10">
        <h3 className="text-center text-sm font-bold uppercase tracking-[0.25em] text-brand-light">
          The 5 Autonomous Agents
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AGENTS.map((a) => (
            <Card key={a.name}>
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-xl">{a.icon}</span>
                <p className="font-semibold">{a.name}</p>
              </div>
              <p className="mt-2 text-sm text-white/70">{a.body}</p>
            </Card>
          ))}
          <Card className="flex flex-col justify-center border-brand/30 bg-brand/10 text-center">
            <p className="text-sm text-white/70">
              Plus a container-image CVE scan and an optional alert to your own
              Slack channel.
            </p>
          </Card>
        </div>
      </section>

      {/* Architecture & privacy */}
      <section className="mt-10">
        <h3 className="text-sm font-bold uppercase tracking-[0.25em] text-brand-light">
          Architecture &amp; Privacy
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {ARCHITECTURE.map((a) => (
            <Card key={a.title}>
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-xl">{a.icon}</span>
                <p className="font-semibold">{a.title}</p>
              </div>
              <p className="mt-2 text-sm text-white/70">{a.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <p className="mt-10 text-center text-sm font-semibold text-white/50">
        SecureTotalScan.com
      </p>
    </div>
  );
}
