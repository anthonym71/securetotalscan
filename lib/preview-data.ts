// Sample data for the /preview marketing dashboard.
//
// Every shape here is a **real backend shape**, matching what the agents
// actually emit — the same shapes `scripts/verify-findings.ts` tests against.
// That is deliberate: a mock built from invented fields would drift from the
// product silently, and a prospect would be shown something we do not ship.
//
// The content is from a deliberately vulnerable demo application, and the page
// says so in three places. A demo a visitor could mistake for their own result
// is a lie with extra steps.

import type { Finding } from "./findings";

export interface PreviewSection {
  title: string;
  items: Finding[];
}

export interface PreviewReport {
  source: string;
  riskLevel: string;
  totalFindings: number;
  agents: { name: string; label: string; summary: string }[];
  sections: PreviewSection[];
}

export const SAMPLE_DEEP_ANALYSIS: PreviewReport = {
  source: "a sample repository scan",
  riskLevel: "CRITICAL",
  totalFindings: 11,
  agents: [
    { name: "log_monitor", label: "Log Monitor", summary: "Parsed 412 lines, 3 anomalies" },
    { name: "threat_intel", label: "Threat Intel", summary: "2 IPs checked against AbuseIPDB" },
    { name: "vuln_scanner", label: "Vuln Scanner", summary: "60 files scanned, 4 findings" },
    { name: "docker_scanner", label: "Docker Scanner", summary: "Trivy: 2 CVEs" },
    { name: "incident_response", label: "Incident Response", summary: "Action plan generated" },
    { name: "policy_checker", label: "Policy Checker", summary: "NIST + SOC 2 mapped" },
  ],
  sections: [
    {
      title: "Code findings",
      items: [
        {
          category: "OWASP-A03",
          name: "SQL Injection",
          severity: "HIGH",
          recommendation:
            "Use parameterised queries instead of interpolating user input into SQL strings.",
          file: "src/db/users.ts",
          line: 42,
          language: "TypeScript",
        },
        {
          category: "OWASP-A02",
          name: "Hardcoded credential",
          severity: "CRITICAL",
          recommendation:
            "Move the value to an environment variable and rotate it — anything committed to git must be treated as public.",
          file: "src/config/mailer.ts",
          line: 8,
          language: "TypeScript",
        },
        {
          category: "OWASP-A07",
          name: "Missing authentication on an admin route",
          severity: "HIGH",
          recommendation:
            "Require an authenticated session and an explicit role check before the handler runs.",
          file: "src/routes/admin.ts",
          line: 17,
          language: "TypeScript",
        },
      ],
    },
    {
      title: "Vulnerabilities",
      items: [
        {
          category: "OWASP-A07",
          name: "Identification and Authentication Failures",
          severity: "HIGH",
          recommendation: "Add rate limiting and account lockout to the authentication path.",
          linked_anomaly: "brute_force",
        },
        {
          header: "content-security-policy",
          severity: "MEDIUM",
          recommendation: "Add a content-security-policy response header",
        },
      ],
    },
    {
      title: "Docker findings",
      items: [
        {
          name: "CVE-2023-45853",
          severity: "CRITICAL",
          description: "Out-of-bounds write in zlib MiniZip",
        },
        {
          name: "Using :latest tag",
          severity: "HIGH",
          description: "The image reference uses the mutable :latest tag",
        },
      ],
    },
    {
      title: "Log anomalies",
      items: [
        { type: "brute_force", source_ip: "203.0.113.42", attempt_count: 14, severity: "CRITICAL" },
        { type: "port_scan", source_ip: "198.51.100.7", severity: "HIGH" },
      ],
    },
    {
      title: "Compliance gaps",
      items: [
        {
          framework: "NIST CSF 2.0",
          control_id: "DE.CM-8",
          description: "Vulnerability scanning is not performed",
          severity: "HIGH",
        },
        {
          framework: "SOC 2 Type II",
          control_id: "CC6.1",
          description: "Logical access controls are not enforced on administrative functions",
          severity: "HIGH",
        },
      ],
    },
  ],
};
