"use client";

import { useRef, useState } from "react";
import {
  AGENT_LABELS,
  AgentEvent,
  SecurityReport,
  SessionEvals,
  analyzeDocker,
  analyzeGithub,
  analyzeLogs,
  analyzeUpload,
  getEvals,
  getReport,
  SecurityReport,
  streamUrl,
} from "@/lib/api";

async function fetchReportWithRetry(
  sessionId: string,
  attempts = 4,
): Promise<SecurityReport> {
  let lastError: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return await getReport(sessionId);
    } catch (err) {
      lastError =
        err instanceof Error ? err : new Error("Failed to load analysis report");
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
      }
    }
  }
  throw lastError ?? new Error("Failed to load analysis report");
}

type Mode = "github" | "docker" | "synthetic" | "system" | "upload";
type Tab = "analysis" | "evals";

const MODES: { id: Mode; label: string }[] = [
  { id: "github", label: "GitHub repo" },
  { id: "docker", label: "Docker Hub image" },
  { id: "synthetic", label: "Synthetic logs" },
  { id: "system", label: "System logs" },
  { id: "upload", label: "Upload logs" },
];

const STATUS_STYLE: Record<string, string> = {
  pending: "text-white/40 border-white/10",
  running: "text-grade-c border-grade-c/40 animate-pulse",
  done: "text-grade-a border-grade-a/40",
  error: "text-grade-f border-grade-f/40",
};

const RISK_STYLE: Record<string, string> = {
  low: "text-grade-a",
  medium: "text-grade-c",
  high: "text-grade-d",
  critical: "text-grade-f",
};

const CORE_AGENTS = [
  "log_monitor",
  "threat_intel",
  "vuln_scanner",
  "docker_scanner",
  "incident_response",
  "policy_checker",
];

const DEFAULT_SLACK_WEBHOOK_URL =
  "https://hooks.slack.com/services/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";

export default function Dashboard() {
  const [mode, setMode] = useState<Mode>("github");
  const [repo, setRepo] = useState("");
  const [dockerImage, setDockerImage] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [slackUrl, setSlackUrl] = useState(DEFAULT_SLACK_WEBHOOK_URL);
  const [tab, setTab] = useState<Tab>("analysis");

  const [status, setStatus] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SecurityReport | null>(null);
  const [evals, setEvals] = useState<SessionEvals | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const doneRef = useRef(false);

  const pipeline = slackUrl.trim()
    ? [...CORE_AGENTS, "slack_notifier"]
    : CORE_AGENTS;

  function canRun() {
    if (running) return false;
    if (mode === "github") return repo.trim().length > 0;
    if (mode === "docker") return dockerImage.trim().length > 0;
    if (mode === "upload") return file !== null;
    return true;
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!canRun()) return;
    setRunning(true);
    setError(null);
    setReport(null);
    setEvals(null);
    setTab("analysis");
    setStatus(Object.fromEntries(pipeline.map((a) => [a, "pending"])));
    doneRef.current = false;
    esRef.current?.close();

    try {
      const slack = slackUrl.trim();
      const url = targetUrl.trim();
      let session_id: string;
      if (mode === "github") {
        ({ session_id } = await analyzeGithub(repo.trim(), false, slack, url));
      } else if (mode === "docker") {
        ({ session_id } = await analyzeDocker(dockerImage.trim(), false, slack, url));
      } else if (mode === "upload") {
        ({ session_id } = await analyzeUpload(file as File, slack));
      } else {
        ({ session_id } = await analyzeLogs(mode, slack, url));
      }

      const es = new EventSource(streamUrl(session_id));
      esRef.current = es;
      es.onmessage = (msg) => {
        let ev: AgentEvent;
        try {
          ev = JSON.parse(msg.data);
        } catch {
          return;
        }
        if (ev.agent === "pipeline" && ev.status === "done") {
          doneRef.current = true;
          es.close();
          setRunning(false);
          fetchReportWithRetry(session_id)
            .then(setReport)
            .catch((err) =>
              setError(
                err instanceof Error
                  ? `${err.message}. Try running the scan again.`
                  : "Failed to load analysis report.",
              ),
            );
          getEvals(session_id).then(setEvals).catch(() => {});
          return;
        }
        setStatus((prev) => ({ ...prev, [ev.agent]: ev.status }));
      };
      es.onerror = () => {
        es.close();
        if (!doneRef.current) {
          setRunning(false);
          setError(
            "Lost connection to the agent backend. Confirm it's running and reachable.",
          );
        }
      };
    } catch (err) {
      setRunning(false);
      setError(
        err instanceof Error
          ? `${err.message}. Is the backend running at the configured API URL?`
          : "Failed to start analysis.",
      );
    }
  }

  const risk = (report?.risk_level ?? "").toLowerCase();

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <a href="/" className="text-sm text-brand-light hover:text-white">
        ← Back to home
      </a>
      <h1 className="mt-4 text-3xl font-bold">Agent dashboard</h1>
      <p className="mt-2 text-white/60">
        Run the deep analysis on a GitHub repo, Docker Hub image, your logs, or
        an uploaded file. Each agent reports live as it finishes.
      </p>

      {/* Mode selector */}
      <div className="mt-6 flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
              mode === m.id
                ? "border-brand bg-brand/15 text-white"
                : "border-white/15 text-white/60 hover:bg-white/5"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <form onSubmit={run} className="mt-4 space-y-3">
        {/* Per-mode input */}
        {mode === "github" && (
          <input
            type="text"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="github.com/you/your-repo"
            className="w-full rounded-xl bg-black/40 px-4 py-3.5 text-white placeholder-white/30 outline-none ring-brand/50 transition focus:ring-2"
            disabled={running}
          />
        )}
        {mode === "docker" && (
          <div className="space-y-2">
            <input
              type="text"
              value={dockerImage}
              onChange={(e) => setDockerImage(e.target.value)}
              placeholder="nginx:latest or hub.docker.com/r/library/nginx"
              className="w-full rounded-xl bg-black/40 px-4 py-3.5 text-white placeholder-white/30 outline-none ring-brand/50 transition focus:ring-2"
              disabled={running}
            />
            <p className="px-1 text-xs text-white/40">
              Paste a Docker Hub image name or URL. Trivy scans the image for CVEs
              when installed on the backend server.
            </p>
          </div>
        )}
        {mode === "upload" && (
          <input
            type="file"
            accept=".log,.txt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-sm text-white/70 file:mr-4 file:rounded-md file:border-0 file:bg-brand file:px-4 file:py-2 file:text-white"
            disabled={running}
          />
        )}
        {(mode === "synthetic" || mode === "system") && (
          <p className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/60">
            {mode === "synthetic"
              ? "Runs the agents over bundled synthetic logs (SSH brute force, port scans, path traversal). No input needed."
              : "Reads recent OS log files on the server (auth.log, syslog). Falls back to synthetic logs if none are readable."}
          </p>
        )}

        {/* Optional target URL for HTTP header checks (all modes) */}
        <div>
          <input
            type="url"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="Optional: https://your-site.com for HTTP header checks"
            className="w-full rounded-xl bg-black/40 px-4 py-3 text-sm text-white placeholder-white/30 outline-none ring-brand/50 transition focus:ring-2"
            disabled={running}
          />
        </div>

        {/* Slack webhook (optional, all modes) */}
        <div>
          <input
            type="url"
            value={slackUrl}
            onChange={(e) => setSlackUrl(e.target.value)}
            placeholder="Optional: Slack incoming webhook URL"
            className="w-full rounded-xl bg-black/40 px-4 py-3 text-sm text-white placeholder-white/30 outline-none ring-brand/50 transition focus:ring-2"
            disabled={running}
          />
          <p className="mt-1 px-1 text-xs text-white/40">
            Pre-filled with the default webhook; edit or clear to use a different
            channel or disable Slack alerts.
          </p>
        </div>

        <button
          type="submit"
          disabled={!canRun()}
          className="rounded-xl bg-brand-gradient px-7 py-3.5 font-semibold shadow-glow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? "Analyzing…" : "Run analysis"}
        </button>
      </form>

      {error && (
        <div className="mt-6 rounded-xl border border-grade-f/30 bg-grade-f/10 px-4 py-3 text-grade-f">
          {error}
        </div>
      )}

      {/* Pipeline */}
      {Object.keys(status).length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Agent pipeline</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pipeline.map((agent) => {
              const s = status[agent] ?? "pending";
              return (
                <div
                  key={agent}
                  className={`rounded-xl border bg-card-gradient px-4 py-3 ${STATUS_STYLE[s] ?? STATUS_STYLE.pending}`}
                >
                  <div className="text-sm font-medium text-white">
                    {AGENT_LABELS[agent] ?? agent}
                  </div>
                  <div className="mt-1 text-xs uppercase tracking-wide">{s}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs */}
      {(report || evals) && (
        <div className="mt-8">
          <div className="mb-4 flex gap-2 border-b border-white/10">
            {(["analysis", "evals"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize transition ${
                  tab === t
                    ? "border-brand text-white"
                    : "border-transparent text-white/50 hover:text-white"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === "analysis" && report && (
            <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Risk level" value={report.risk_level ?? "—"} className={RISK_STYLE[risk]} />
                <Metric label="Files scanned" value={report.files_scanned ?? 0} />
                <Metric label="Primary language" value={report.primary_language || "—"} />
                <Metric label="Compliance" value={`${report.compliance_score ?? 0}%`} />
              </div>

              <SlackStatus report={report} slackConfigured={!!slackUrl.trim()} />

              <TrivyStatus report={report} />

              <FindingList title="Docker findings" items={report.docker_findings} />
              <FindingList title="Code findings" items={report.code_findings} />
              <FindingList title="Vulnerabilities" items={report.vulnerabilities} />
              <FindingList title="Log anomalies" items={report.anomalies} />
              <FindingList title="Compliance gaps" items={report.compliance_gaps} />
              <RagSources sources={report.retrieved_sources} />

              {typeof report.docker_scan_error === "string" && report.docker_scan_error && (
                <div className="rounded-xl border border-grade-d/30 bg-grade-d/10 px-4 py-3 text-sm text-grade-d">
                  Docker scan: {report.docker_scan_error}
                </div>
              )}

              {report.action_plan && report.action_plan.length > 0 ? (
                <div className="rounded-2xl border border-white/10 bg-card-gradient p-5">
                  <h3 className="font-semibold">Recommended actions</h3>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-white/70">
                    {report.action_plan.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-card-gradient p-5 text-sm text-white/50">
                  Recommended actions were not generated for this run. Check that
                  the incident response agent finished, then try again.
                </div>
              )}

              {typeof report.scan_error === "string" && report.scan_error && (
                <div className="rounded-xl border border-grade-d/30 bg-grade-d/10 px-4 py-3 text-sm text-grade-d">
                  {report.scan_error}
                </div>
              )}
            </div>
          )}

          {tab === "evals" && <EvalsView evals={evals} />}
        </div>
      )}
    </main>
  );
}

function Metric({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-center">
      <div className="text-xs uppercase tracking-wide text-white/40">{label}</div>
      <div className={`mt-1 text-xl font-bold ${className}`}>{value}</div>
    </div>
  );
}

function SlackStatus({
  report,
  slackConfigured,
}: {
  report: SecurityReport;
  slackConfigured: boolean;
}) {
  if (!slackConfigured) return null;
  if (report.slack_sent) {
    return (
      <div className="rounded-xl border border-grade-a/30 bg-grade-a/10 px-4 py-3 text-sm text-grade-a">
        Suggestions posted to your Slack channel.
      </div>
    );
  }
  if (report.slack_error) {
    return (
      <div className="rounded-xl border border-grade-f/30 bg-grade-f/10 px-4 py-3 text-sm text-grade-f">
        Slack post failed: {report.slack_error}
      </div>
    );
  }
  return null;
}

function FindingList({
  title,
  items,
}: {
  title: string;
  items?: Record<string, unknown>[];
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-card-gradient p-5">
      <h3 className="font-semibold">
        {title} <span className="text-white/40">({items.length})</span>
      </h3>
      <ul className="mt-3 space-y-2">
        {items.slice(0, 25).map((item, i) => {
          const sev = String(item.severity ?? item.level ?? "").toLowerCase();
          const text =
            (item.message as string) ??
            (item.description as string) ??
            (item.title as string) ??
            (item.type as string) ??
            JSON.stringify(item);
          const where = (item.file ?? item.path ?? item.location) as string | undefined;
          return (
            <li
              key={i}
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
            >
              {sev && (
                <span className={`mr-2 font-semibold ${RISK_STYLE[sev] ?? "text-white/60"}`}>
                  [{sev}]
                </span>
              )}
              <span className="text-white/75">{text}</span>
              {where && (
                <span className="ml-2 font-mono text-xs text-white/40">{where}</span>
              )}
              {typeof item.fix_prompt === "string" && item.fix_prompt && (
                <CopyFixPrompt prompt={item.fix_prompt} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TrivyStatus({ report }: { report: SecurityReport }) {
  if (report.docker_skipped) return null;
  const available = report.docker_trivy_available;
  const ran = report.docker_trivy_ran;
  const count = report.docker_trivy_cve_count ?? 0;
  const err = report.docker_trivy_error;

  if (!available) {
    return (
      <div className="rounded-xl border border-grade-c/30 bg-grade-c/10 px-4 py-3 text-sm text-grade-c">
        Trivy is not installed on the backend — only Docker Hub metadata checks ran.
        Run <code className="text-xs">backend/scripts/install-trivy.sh</code> to enable CVE scanning.
      </div>
    );
  }
  if (err) {
    return (
      <div className="rounded-xl border border-grade-f/30 bg-grade-f/10 px-4 py-3 text-sm text-grade-f">
        Trivy CVE scan failed: {err}
      </div>
    );
  }
  if (ran) {
    return (
      <div className="rounded-xl border border-grade-a/30 bg-grade-a/10 px-4 py-3 text-sm text-grade-a">
        Trivy CVE scan complete — {count} vulnerabilit{count === 1 ? "y" : "ies"} found in{" "}
        {String(report.docker_image ?? "image")}.
      </div>
    );
  }
  return null;
}

function CopyFixPrompt({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(prompt).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="mt-2 block text-xs text-brand-light hover:text-white"
    >
      {copied ? "Copied fix prompt" : "Copy fix prompt"}
    </button>
  );
}

function RagSources({
  sources,
}: {
  sources?: Record<string, unknown>[];
}) {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="rounded-2xl border border-brand/20 bg-brand/5 p-5">
      <h3 className="font-semibold">
        Retrieved knowledge (RAG){" "}
        <span className="text-white/40">({sources.length})</span>
      </h3>
      <ul className="mt-3 space-y-2">
        {sources.map((s, i) => (
          <li
            key={i}
            className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/75"
          >
            <span className="font-medium text-brand-light">
              [{String(s.framework ?? "KB")}] {String(s.title ?? s.id ?? "Source")}
            </span>
            {typeof s.content === "string" && s.content && (
              <p className="mt-1 text-xs text-white/50">{s.content}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function EvalsView({ evals }: { evals: SessionEvals | null }) {
  if (!evals) {
    return <p className="text-white/50">No eval data yet. Run an analysis first.</p>;
  }
  const s = evals.summary;
  const hitRate = `${Math.round((s.llm_cache_hit_rate ?? 0) * 100)}%`;
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Cost" value={`$${(s.total_cost_usd ?? 0).toFixed(4)}`} />
        <Metric label="Saved by cache" value={`$${(s.cost_saved_usd ?? 0).toFixed(4)}`} className="text-grade-a" />
        <Metric label="Total tokens" value={(s.total_tokens ?? 0).toLocaleString()} />
        <Metric label="Cache hit rate" value={hitRate} />
      </div>

      <div className="rounded-2xl border border-white/10 bg-card-gradient p-5">
        <h3 className="font-semibold">Per-agent</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-white/40">
              <tr>
                <th className="py-2 pr-4 font-medium">Agent</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">Tokens</th>
                <th className="py-2 pr-4 font-medium">Cost</th>
                <th className="py-2 font-medium">Latency</th>
              </tr>
            </thead>
            <tbody className="text-white/75">
              {evals.agents.map((a) => (
                <tr key={a.agent} className="border-t border-white/10">
                  <td className="py-2 pr-4">{a.label}</td>
                  <td className="py-2 pr-4 text-white/50">{a.type}</td>
                  <td className="py-2 pr-4">{(a.tokens?.total ?? 0).toLocaleString()}</td>
                  <td className="py-2 pr-4">${(a.cost_usd ?? 0).toFixed(4)}</td>
                  <td className="py-2">{Math.round(a.latency_ms ?? 0)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-white/40">
          Source: {evals.log_source} · {evals.line_count} lines · cache hits{" "}
          {s.llm_cache_hits}/{s.llm_cache_hits + s.llm_cache_misses}
        </p>
      </div>
    </div>
  );
}
