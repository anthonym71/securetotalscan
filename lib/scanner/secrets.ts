import type { CategoryResult, Finding, ScanContext } from "./types";

interface SecretPattern {
  name: string;
  regex: RegExp;
  severity: Finding["severity"];
  category: "secrets" | "database" | "ai-risks";
  note: string;
}

/**
 * Patterns for credentials that should never appear in client-side JS.
 * Kept deliberately conservative to limit false positives. We redact the
 * matched value before showing it back to the user.
 */
const PATTERNS: SecretPattern[] = [
  {
    name: "AWS Access Key ID",
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    severity: "critical",
    category: "secrets",
    note: "AWS access key IDs grant programmatic access to your AWS account.",
  },
  {
    name: "Google API Key",
    regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g,
    severity: "high",
    category: "secrets",
    note: "Google API keys can incur billing and access Google services if unrestricted.",
  },
  {
    name: "OpenAI API Key",
    regex: /\bsk-(?:proj-)?[A-Za-z0-9\-_]{20,}\b/g,
    severity: "critical",
    category: "ai-risks",
    note: "An OpenAI key in client code lets anyone spend your API credits.",
  },
  {
    name: "Anthropic API Key",
    regex: /\bsk-ant-[A-Za-z0-9\-_]{20,}\b/g,
    severity: "critical",
    category: "ai-risks",
    note: "An Anthropic key in client code lets anyone spend your API credits.",
  },
  {
    name: "Stripe Secret Key",
    regex: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/g,
    severity: "critical",
    category: "secrets",
    note: "A live Stripe secret key allows charging customers and issuing refunds.",
  },
  {
    name: "GitHub Token",
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/g,
    severity: "critical",
    category: "secrets",
    note: "GitHub tokens can read and write your repositories.",
  },
  {
    name: "Slack Token",
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    severity: "high",
    category: "secrets",
    note: "Slack tokens can read messages and post as your app.",
  },
  {
    name: "Private Key Block",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
    severity: "critical",
    category: "secrets",
    note: "A private key embedded in the client fully compromises whatever it protects.",
  },
  {
    name: "Supabase service_role JWT",
    // service_role JWTs literally contain the role claim; anon keys are expected client-side.
    regex: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]*(?:service_role|c2VydmljZV9yb2xl)[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+/g,
    severity: "critical",
    category: "database",
    note: "The Supabase service_role key bypasses Row Level Security — full DB access.",
  },
  {
    name: "Firebase config (databaseURL)",
    regex: /["']https:\/\/[a-z0-9-]+\.firebaseio\.com["']/g,
    severity: "low",
    category: "database",
    note: "Firebase Realtime DB URL exposed — verify security rules are not open.",
  },
];

function redact(match: string): string {
  if (match.length <= 10) return match.slice(0, 2) + "…";
  return match.slice(0, 6) + "…" + match.slice(-4);
}

/** Scans concatenated bundle + inline source for hardcoded credentials. */
export function checkSecrets(ctx: ScanContext): {
  secrets: CategoryResult;
  ai: Finding[];
  database: Finding[];
} {
  const haystack = ctx.bundleSource + "\n" + ctx.html;
  const secretFindings: Finding[] = [];
  const aiFindings: Finding[] = [];
  const dbFindings: Finding[] = [];
  const seen = new Set<string>();

  for (const pat of PATTERNS) {
    const matches = haystack.match(pat.regex);
    if (!matches) continue;
    for (const raw of matches.slice(0, 3)) {
      const key = pat.name + redact(raw);
      if (seen.has(key)) continue;
      seen.add(key);

      const finding: Finding = {
        category: pat.category,
        severity: pat.severity,
        title: `Exposed ${pat.name}`,
        detail: `${pat.note} Found in client-delivered JavaScript/HTML.`,
        evidence: `${pat.name}: ${redact(raw)}`,
        fixPrompt: `Remove the hardcoded ${pat.name} from all client-side code. Move it to a server-side environment variable (e.g. process.env) and proxy any calls that need it through a backend API route. Then rotate/revoke the exposed key immediately because it must be treated as compromised.`,
      };

      if (pat.category === "ai-risks") aiFindings.push(finding);
      else if (pat.category === "database") dbFindings.push(finding);
      else secretFindings.push(finding);
    }
  }

  return {
    secrets: {
      id: "secrets",
      label: "API Keys & Secrets",
      passed: secretFindings.length === 0,
      findings: secretFindings,
    },
    ai: aiFindings,
    database: dbFindings,
  };
}
