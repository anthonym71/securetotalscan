// Marketing copy for Secure Total Scan (Rev 2). All original wording.
// Brand name / email / copyright live in lib/brand.ts.
import { COPYRIGHT } from "./brand";

export const HERO = {
  eyebrow: "Security for anything exposed to the internet",
  title: ["If it's online, it can leak.", "Find out before someone else does."],
  subtitle: "Your AI shipped it. We make sure it's safe to ship.",
  body: "Vibe-coded or hand-built, any website, app, or file on the internet can expose you. Scan a URL, a GitHub repo, or your logs. Autonomous agents find what's open and hand you the exact fix, in under a minute.",
  cta: "Run a free scan",
};

export const TRUST = {
  headline: "We can't lose data we never keep.",
  body: "Every file and log you upload is encrypted in transit, analyzed in memory, then discarded the moment the scan ends. Nothing is persisted. Nothing trains a model. Your data stays yours, and our service stays accountable. That's the contract.",
};

export const SCAN_SECTION = {
  title: "Scan it now",
  body: "Paste a public URL or GitHub repo. We'll tell you exactly what's exposed, for free.",
  button: "Run scan",
  placeholder: "https://your-app.com  ·  or  github.com/you/repo",
  supports: "Works with any public URL or repo. Lovable, Bolt, Replit, Cursor, Vercel, Netlify, or your own domain.",
};

export interface Step {
  icon: string;
  title: string;
  body: string;
}

export const HOW_IT_WORKS: Step[] = [
  {
    icon: "🛰️",
    title: "Free surface scan",
    body: "Headers, secrets, CORS, SSL, and exposed files. You get an instant A–F grade.",
  },
  {
    icon: "🧠",
    title: "Deep agent analysis",
    body: "Five autonomous agents inspect your code, logs, threats, and compliance gaps.",
  },
  {
    icon: "🔧",
    title: "Fix and monitor",
    body: "Copy-paste fix prompts for every finding, then keep watch on a schedule.",
  },
];

export interface ScanFeature {
  icon: string;
  title: string;
  body: string;
}

// What the free surface scan checks (passive, no LLM).
export const SCAN_FEATURES: ScanFeature[] = [
  { icon: "🔓", title: "Database exposure", body: "Open Supabase/Firebase access and unprotected data endpoints." },
  { icon: "🔑", title: "Keys & secrets", body: "Hardcoded credentials and secrets shipped in client-side code." },
  { icon: "🛡️", title: "Security headers", body: "Missing CSP, HSTS, and the headers that stop XSS and clickjacking." },
  { icon: "🌐", title: "CORS policy", body: "Permissive cross-origin rules that let any site read your API." },
  { icon: "📡", title: "SSL/TLS", body: "Mixed content, weak config, and certificates that fail." },
  { icon: "📁", title: "Exposed files", body: "Reachable .env, .git, configs, and backup directories." },
];

export interface Agent {
  icon: string;
  title: string;
  body: string;
}

// The deep engine (LangGraph agents, from the FastAPI backend).
export const AGENTS: Agent[] = [
  { icon: "📝", title: "Log monitor", body: "Ingests logs, flags anomalies, scores severity from low to critical." },
  { icon: "🎯", title: "Threat intel", body: "Maps DDoS and MITRE ATT&CK patterns against live threat indicators." },
  { icon: "🐛", title: "Vulnerability scanner", body: "Scans repos for leaked keys, injection risks, and insecure patterns." },
  { icon: "🚑", title: "Incident response", body: "Matches CVEs, prioritizes risk, and recommends remediation." },
  { icon: "📋", title: "Compliance", body: "Checks gaps against NIST CSF and SOC 2 controls." },
  { icon: "💰", title: "Cost control", body: "LLM caching means repeat scans cost near zero. Every token is tracked." },
];

export interface Stat {
  value: string;
  label: string;
  source: string;
}

export const STATS: Stat[] = [
  { value: "45%", label: "of AI-generated code contains security vulnerabilities", source: "Veracode 2025 Report" },
  { value: "$10.2M", label: "average cost of a US data breach in 2025 (all-time high)", source: "IBM Security Report" },
  { value: "1 in 5", label: "breaches now linked to AI-generated code", source: "Aikido Security 2026" },
  { value: "41%", label: "of all code is now written by AI tools", source: "2026 Industry Data" },
];

export const STATS_CALLOUT =
  "Most apps on the internet are leaking something. The only question is whether you find it first.";

export interface Plan {
  name: string;
  price: string;
  cadence?: string;
  features: string[];
  featured?: boolean;
}

export const PLANS: Plan[] = [
  {
    name: "Free",
    price: "$0",
    features: ["Surface scan", "A–F security grade", "Copy-paste fix prompts"],
  },
  {
    name: "Pro",
    price: "$49",
    cadence: "/mo",
    featured: true,
    features: ["All five agents", "Repo + log analysis", "Scheduled monitoring", "Email PDF reports"],
  },
  {
    name: "Organization",
    price: "Custom",
    features: ["Continuous monitoring", "Compliance reports", "SSO and SLAs", "Priority support"],
  },
];

export interface FaqItem {
  q: string;
  a: string;
}

export const FAQS: FaqItem[] = [
  {
    q: "Is this only for AI-built apps?",
    a: "No. Vibe-coded apps tend to leak more because AI tools optimize for working output, not secure output, but the scanner works against any public URL, repo, or log file. If it's exposed to the internet, we can check it.",
  },
  {
    q: "Do you store my data or train models on it?",
    a: "Never. Files and logs are encrypted in transit, analyzed in memory, and discarded the moment the scan ends. Nothing is persisted, and nothing is used to train any model. Detected secrets are redacted before they're shown back to you.",
  },
  {
    q: "How does the scan actually work?",
    a: "The free scan reads what your app already serves publicly, then runs passive checks on headers, CORS, SSL, secrets in the bundle, and exposed files. The deep analysis runs five autonomous agents over your repo and logs for threats, vulnerabilities, and compliance gaps.",
  },
  {
    q: "What do I do with the findings?",
    a: "Start with anything marked critical. Every finding ships with a copy-paste fix prompt you can hand straight to your AI tool. After fixing, rotate any exposed credentials and re-scan to confirm.",
  },
  {
    q: "How long does it take?",
    a: "The surface scan returns in under 60 seconds. The deep agent analysis runs in parallel and streams results live as each agent finishes.",
  },
  {
    q: "Is the free scan really free?",
    a: "Yes. The free scan gives you a complete surface assessment with every finding and a fix prompt. No credit card, no limits. The agents and continuous monitoring are the paid tiers.",
  },
];

export const FOOTER = COPYRIGHT;
