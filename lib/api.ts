// Client for the Secure Total Scan agent backend (FastAPI + LangGraph).
// The backend lives in /backend and deploys to Railway.
// Set NEXT_PUBLIC_API_URL to its public URL in your environment.
// Shapes mirror backend/main.py, session_events.py, and session_evals.py.

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface StartResponse {
  session_id: string;
  [key: string]: unknown;
}

async function postJson(path: string, body: unknown): Promise<StartResponse> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Backend returned ${res.status}`);
  }
  return res.json();
}

/** Analyze synthetic or system logs. */
export function analyzeLogs(
  source: "synthetic" | "system",
  slackWebhookUrl = "",
  targetUrl = "",
): Promise<StartResponse> {
  return postJson("/analyze", {
    source,
    slack_webhook_url: slackWebhookUrl,
    target_url: targetUrl,
  });
}

/** Analyze a GitHub repository (optionally combined with logs). */
export function analyzeGithub(
  repoUrl: string,
  includeLogs = false,
  slackWebhookUrl = "",
  targetUrl = "",
): Promise<StartResponse> {
  return postJson("/analyze/github", {
    repo_url: repoUrl,
    include_logs: includeLogs,
    slack_webhook_url: slackWebhookUrl,
    target_url: targetUrl,
  });
}

/** Analyze a Docker Hub image (optionally combined with logs). */
export function analyzeDocker(
  imageUrl: string,
  includeLogs = false,
  slackWebhookUrl = "",
  targetUrl = "",
): Promise<StartResponse> {
  return postJson("/analyze/docker", {
    image_url: imageUrl,
    include_logs: includeLogs,
    slack_webhook_url: slackWebhookUrl,
    target_url: targetUrl,
  });
}

/** Analyze an uploaded .log / .txt file. */
export async function analyzeUpload(
  file: File,
  slackWebhookUrl = "",
): Promise<StartResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("slack_webhook_url", slackWebhookUrl);
  const res = await fetch(`${API_BASE}/analyze/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Backend returned ${res.status}`);
  }
  return res.json();
}

// SSE event shape (backend/session_events.py emit_sync()).
export interface AgentEvent {
  agent: string;
  status: "pending" | "running" | "done" | "error" | string;
  findings?: unknown[];
  timestamp?: string;
}

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
  runbook_md?: string;
  docker_findings?: Record<string, unknown>[];
  docker_image?: string;
  docker_skipped?: boolean;
  docker_scan_error?: string;
  docker_trivy_available?: boolean;
  docker_trivy_ran?: boolean;
  docker_trivy_cve_count?: number;
  docker_trivy_error?: string;
  retrieved_sources?: Record<string, unknown>[];
  target_url?: string;
  slack_sent?: boolean;
  slack_error?: string;
  slack_skipped?: boolean;
  [key: string]: unknown;
}

export async function getReport(sessionId: string): Promise<SecurityReport> {
  const res = await fetch(`${API_BASE}/report/${sessionId}`);
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  return res.json();
}

// Eval payload (backend/session_evals.py session_to_dict()).
export interface EvalSummary {
  total_cost_usd: number;
  cost_if_uncached_usd: number;
  cost_saved_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_latency_ms: number;
  llm_cache_hits: number;
  llm_cache_misses: number;
  llm_cache_hit_rate: number;
}

export interface AgentEval {
  agent: string;
  label: string;
  type: string;
  latency_ms: number;
  tokens: { input: number; output: number; total: number };
  cost_usd: number;
  cost_saved_usd: number;
  calls: unknown[];
}

export interface SessionEvals {
  session_id: string;
  log_source: string;
  line_count: number;
  summary: EvalSummary;
  agents: AgentEval[];
  [key: string]: unknown;
}

export async function getEvals(sessionId: string): Promise<SessionEvals> {
  const res = await fetch(`${API_BASE}/evals/${sessionId}`);
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  return res.json();
}

export const AGENT_LABELS: Record<string, string> = {
  log_monitor: "Log monitor",
  threat_intel: "Threat intel",
  vuln_scanner: "Vulnerability scanner",
  docker_scanner: "Docker scanner",
  incident_response: "Incident response",
  policy_checker: "Compliance",
  slack_notifier: "Slack notifier",
  pipeline: "Pipeline",
};
