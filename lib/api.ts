// Client for the Secure Total Scan agent backend (FastAPI + LangGraph).
// The backend lives in /backend and deploys to Railway.
// Set NEXT_PUBLIC_API_URL to its public URL in your environment.
// Shapes mirror backend/main.py and backend/session_events.py.

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface StartResponse {
  session_id: string;
  [key: string]: unknown;
}

/** Kick off a GitHub repository analysis. Returns a session id to stream. */
export async function analyzeGithub(
  repoUrl: string,
  includeLogs = false,
): Promise<StartResponse> {
  const res = await fetch(`${API_BASE}/analyze/github`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repo_url: repoUrl, include_logs: includeLogs }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Backend returned ${res.status}`);
  }
  return res.json();
}

/** Kick off a log analysis (source: "synthetic" | "system"). */
export async function analyzeLogs(source: string): Promise<StartResponse> {
  const res = await fetch(`${API_BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  });
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  return res.json();
}

// SSE event shape emitted by backend/session_events.py emit_sync().
export interface AgentEvent {
  agent: string;
  status: "pending" | "running" | "done" | "error" | string;
  findings?: unknown[];
  timestamp?: string;
}

/** SSE URL for streaming live agent progress for a session. */
export function streamUrl(sessionId: string): string {
  return `${API_BASE}/stream/${sessionId}`;
}

// Final pipeline state (backend/state.py SecurityState + session meta).
export interface SecurityReport {
  risk_level?: string;
  threat_score?: number;
  compliance_score?: number;
  files_scanned?: number;
  primary_language?: string;
  github_repo?: string;
  anomalies?: Record<string, unknown>[];
  vulnerabilities?: Record<string, unknown>[];
  code_findings?: Record<string, unknown>[];
  compliance_gaps?: Record<string, unknown>[];
  action_plan?: string[];
  scan_error?: string;
  [key: string]: unknown;
}

/** Fetch the final report once the run completes. */
export async function getReport(sessionId: string): Promise<SecurityReport> {
  const res = await fetch(`${API_BASE}/report/${sessionId}`);
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  return res.json();
}

/** Fetch session evals: tokens, cost, cache hits. */
export async function getEvals(sessionId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/evals/${sessionId}`);
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  return res.json();
}

// Human-friendly agent labels (keys match session_events.py status map).
export const AGENT_LABELS: Record<string, string> = {
  log_monitor: "Log monitor",
  threat_intel: "Threat intel",
  vuln_scanner: "Vulnerability scanner",
  incident_response: "Incident response",
  policy_checker: "Compliance",
  slack_notifier: "Notifier",
  pipeline: "Pipeline",
};
