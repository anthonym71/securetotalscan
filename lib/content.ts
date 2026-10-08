// Marketing copy for Secure Total Scan (Rev 2). All original wording.
// Brand name / email / copyright live in lib/brand.ts.
import { COPYRIGHT } from "./brand";

export const HERO = {
  eyebrow: "Security for anything exposed to the internet",
  title: ["If it's online, it can leak.", "Find out before someone else does."],
  subtitle: "Your AI shipped it. We make sure it's safe to ship.",
  // The free scanner takes a URL. Repo and log analysis is the deep agent
  // pipeline behind the dashboard, which is a paid tier — saying "scan a URL,
  // a GitHub repo, or your logs" in the hero promised the free scan could do
  // all three.
  body: "Vibe-coded or hand-built, any website or app on the internet can expose you. Scan a public URL free in under a minute — autonomous agents find what's open and hand you the exact fix. Repo and log analysis runs in the deep agent dashboard.",
  cta: "Run a free scan",
};

export const TRUST = {
  headline: "Know what happens to your scan data.",
  body: "Surface-scan results are stored when storage is available, with a six-month retention review date. Stored reports omit URL query strings and fragments; fetched pages and JavaScript bundles are not stored with the report. Automatic deletion and online history are still being built. Your email is kept in our CRM for security updates; you can unsubscribe.",
};

export const SCAN_SECTION = {
  title: "Scan it now",
  body: "Paste a public URL. We'll tell you exactly what's exposed, for free.",
  button: "Run scan",
  // A GitHub URL typed here is scanned as a web page, not as a repository —
  // the placeholder was inviting an input the free scanner cannot honour.
  placeholder: "https://your-app.com  ·  or  your-app.com",
  supports: "Works with any public URL. Lovable, Bolt, Replit, Cursor, Vercel, Netlify, or your own domain.",
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
    title: "Fix and re-scan",
    body: "Use the fix prompts, then run another scan to check your changes.",
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
  checkoutEnv?: string;
}

export const PLANS: Plan[] = [
  {
    name: "Free",
    price: "$0",
    features: ["Public surface scan", "A–F security grade", "Top findings", "One fix sample", "Saved PDF when storage is available"],
  },
  {
    name: "Report",
    price: "$9",
    cadence: " one-time",
    checkoutEnv: "NEXT_PUBLIC_CHECKOUT_REPORT",
    features: ["Full surface findings", "All available fix prompts", "PDF report", "One priority re-scan", "No subscription"],
  },
  {
    name: "Pro",
    price: "$49",
    cadence: "/month",
    featured: true,
    checkoutEnv: "NEXT_PUBLIC_CHECKOUT_PRO",
    features: ["10 deep scans / month", "Repo, Docker and log analysis", "Full fix prompts", "Saved reports", "Email delivery", "Monitoring alerts"],
  },
  {
    name: "Business",
    price: "$99",
    cadence: "/month",
    checkoutEnv: "NEXT_PUBLIC_CHECKOUT_BUSINESS",
    features: ["100 deep scans / month", "5 team seats", "Everything in Pro", "Priority monitoring", "Compliance reports", "Higher usage limits"],
  },
  {
    name: "Organization",
    price: "Custom",
    features: ["Custom scan volume", "Custom seats", "SSO / enterprise controls", "Custom compliance scope", "Dedicated onboarding and SLA"],
  },
];

export interface FaqItem {
  q: string;
  a: string;
}

export const FAQS: FaqItem[] = [
  {
    q: "Is this only for AI-built apps?",
    a: "No. Vibe-coded apps tend to leak more because AI tools optimize for working output, not secure output, but the free scanner works against any public URL, and the deep agent analysis covers repos, container images and log files. If it's exposed to the internet, we can check it.",
  },
  {
    q: "Do you store my data or train models on it?",
    a: "Surface-scan reports are stored when available, with a six-month retention review date. Online history and automated deletion are not live yet. Fetched pages and bundles are not stored with the report. Deep analysis uses external model services; do not submit credentials or sensitive personal data. Your email is kept in our CRM for security updates.",
  },
  {
    q: "How does the scan actually work?",
    a: "The free scan reads what your app already serves publicly, then runs passive checks on headers, CORS, SSL, secrets in the bundle, and exposed files. The deep analysis runs five autonomous agents over your repo and logs for threats, vulnerabilities, and compliance gaps.",
  },
  {
    q: "What do I do with the findings?",
    a: "Start with anything marked critical. A free scan includes a medium-severity fix sample when available. Members receive the full fix prompts. After fixing, rotate any exposed credentials and re-scan to confirm.",
  },
  {
    q: "How long does it take?",
    a: "The surface scan returns in under 60 seconds. The deep agent analysis runs in parallel and streams results live as each agent finishes.",
  },
  {
    q: "Is the free scan really free?",
    // "No limits" was false: /api/scan enforces 5 scans/hour and 20/day per IP,
    // 10/day per email, and 10/hour per target domain. Stating them is also
    // better product — a visitor who hits a limit unexpectedly assumes we are
    // broken.
    a: "Yes, no credit card. The free scan gives you the findings and one medium-severity fix sample when available. Fair-use limits apply — 5 scans an hour and 20 a day — so the scanner stays available for everyone. Paid checkout, automated monitoring and emailed reports are still in development.",
  },
];

export const FOOTER = COPYRIGHT;
