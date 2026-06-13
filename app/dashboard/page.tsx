"use client";

import { useEffect, useRef, useState } from "react";
import {
  AGENT_LABELS,
  AgentEvent,
  RagStatus,
  SecurityReport,
  SessionEvals,
  analyzeGithub,
  analyzeLogs,
  analyzeUpload,
  getEvals,
  getRagStatus,
  getReport,
  indexKnowledge,
  streamUrl,
} from "@/lib/api";
import { PolicyPanel } from "@/components/PolicyPanel";

type Mode = "github" | "synthetic" | "system" | "upload";
type Tab = "analysis" | "policies" | "evals";

const MODES: { id: Mode; label: string }[] = [
  { id: "github", label: "GitHub repo" },
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
  "incident_response",
  "policy_checker",
];

export default function Dashboard() {
  const [mode, setMode] = useState<Mode>("github");
  const [repo, setRepo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [slackUrl, setSlackUrl] = useState("");
  const [tab, setTab] = useState<Tab>("analysis");

  const [status, setStatus] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SecurityReport | null>(null);
  const [evals, setEvals] = useState<SessionEvals | null>(null);
  const [ragStatus, setRagStatus] = useState<RagStatus | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [indexMsg, setIndexMsg] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    getRagStatus()
      .then(setRagStatus)
      .catch(() =>
        setRagStatus({
          enabled: false,
          ready: false,
          document_count: 0,
          persist_dir: "",
          message: "Could not reach backend RAG status",
        }),
      );
  }, []);

  async function rebuildIndex() {
    setIndexing(true);
    setIndexMsg(null);
    try {
      const result = await indexKnowledge(true);
      setRagStatus(result.status);
      setIndexMsg(
        `Indexed ${result.summary.chunks_indexed} chunks from ${result.summary.files_indexed} files.`,
      );
    } catch (err) {
      setIndexMsg(
        err instanceof Error ? err.message : "Failed to rebuild knowledge index",
      );
    } finally {
      setIndexing(false);
    }
  }

  const pipeline = slackUrl.trim()
    ? [...CORE_AGENTS, "slack_notifier"]
    : CORE_AGENTS;

  function canRun() {
    if (running) return false;
    if (mode === "github") return repo.trim().length > 0;
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
      let session_id: string;
      if (mode === "github") {
        ({ session_id } = await analyzeGithub(repo.trim(), false, slack));
      } else if (mode === "upload") {
        ({ session_id } = await analyzeUpload(file as File, slack));
      } else {
        ({ session_id } = await analyzeLogs(mode, slack));
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
          getReport(session_id).then(setReport).catch(() => {});
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
        Run the five-agent deep analysis on a repo, your logs, or an uploaded
        file. Each agent reports live as it finishes.
      </p>

      {/* RAG knowledge base — index before deploy; re-index on demand here */}
      <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Knowledge base (RAG)</h2>
            <p className="mt-1 text-xs text-white/50">
              Threat Intel and Compliance agents retrieve NIST/SOC2 controls and
              runbooks from the vector index. Index before Railway deploy; re-index
              here after updating knowledge files.
            </p>
            {ragStatus && (
              <p
                className={`mt-2 text-sm ${
                  ragStatus.ready ? "text-grade-a" : "text-grade-c"
                }`}
              >
                {ragStatus.message}
                {ragStatus.ready && (
                  <span className="text-white/40">
                    {" "}
                    · {ragStatus.document_count} chunks
                  </span>
                )}
              </p>
            )}
            {indexMsg && (
              <p className="mt-2 text-xs text-white/60">{indexMsg}</p>
            )}
          </div>
          <button
            type="button"
            onClick={rebuildIndex}
            disabled={indexing || running}
            className="shrink-0 rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {indexing ? "Indexing…" : "Re-index knowledge base"}
          </button>
        </div>
      </div>

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
            Provide a webhook and the incident-response suggestions get posted to
            your Slack channel automatically.
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
            {(["analysis", "policies", "evals"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize transition ${
                  tab === t
                    ? "border-brand text-white"
                    : "border-transparent text-white/50 hover:text-white"
                }`}
              >
                {t === "policies" ? "Policies" : t}
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

              <FindingList title="Code findings" items={report.code_findings} />
              <FindingList title="Vulnerabilities" items={report.vulnerabilities} />
              <FindingList title="Log anomalies" items={report.anomalies} />
              <ThreatIntelPanel report={report} />

              {(report.compliance_gaps?.length ?? 0) > 0 && (
                <div className="rounded-2xl border border-white/10 bg-card-gradient p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">Policy gaps detected</h3>
                      <p className="mt-1 text-sm text-white/50">
                        {report.compliance_gaps?.length} control
                        {(report.compliance_gaps?.length ?? 0) === 1 ? "" : "s"} flagged
                        across NIST and SOC 2 frameworks.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTab("policies")}
                      className="rounded-lg border border-brand/40 px-4 py-2 text-sm font-medium text-brand-light transition hover:bg-brand/10"
                    >
                      View policies →
                    </button>
                  </div>
                </div>
              )}

              {report.action_plan && report.action_plan.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-card-gradient p-5">
                  <h3 className="font-semibold">Recommended actions</h3>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-white/70">
                    {report.action_plan.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}

              {report.scan_error && (
                <div className="rounded-xl border border-grade-d/30 bg-grade-d/10 px-4 py-3 text-sm text-grade-d">
                  {report.scan_error}
                </div>
              )}
            </div>
          )}

          {tab === "policies" && report && (
            <div className="animate-fade-in">
              <PolicyPanel
                gaps={report.compliance_gaps}
                complianceContext={report.compliance_context}
                complianceScore={report.compliance_score}
                ragReady={ragStatus?.ready}
              />
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

function ThreatIntelPanel({ report }: { report: SecurityReport }) {
  const cves = (report.cve_matches ?? []) as Array<{
    id?: string;
    description?: string;
    cvss_score?: number;
    linked_anomaly?: string;
    rag_context?: string[];
  }>;
  const context = report.threat_intel_context ?? [];

  if (!cves.length && !context.length) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-card-gradient p-5">
      <h3 className="font-semibold">
        Threat intelligence{" "}
        <span className="text-white/40">
          (score {report.threat_score ?? 0})
        </span>
      </h3>

      {cves.length > 0 && (
        <ul className="mt-3 space-y-2">
          {cves.slice(0, 10).map((cve, i) => (
            <li
              key={`${cve.id}-${i}`}
              className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
            >
              <div className="font-mono text-brand-light">{cve.id ?? "CVE"}</div>
              <p className="mt-1 text-white/75">{cve.description ?? "—"}</p>
              {cve.linked_anomaly && (
                <p className="mt-1 text-xs text-white/40">
                  Linked anomaly: {cve.linked_anomaly}
                  {cve.cvss_score != null && ` · CVSS ${cve.cvss_score}`}
                </p>
              )}
              {cve.rag_context && cve.rag_context.length > 0 && (
                <div className="mt-2 rounded border border-brand/20 bg-brand/5 p-2">
                  <p className="text-xs font-semibold uppercase text-brand-light">
                    RAG runbook
                  </p>
                  {cve.rag_context.map((snippet, j) => (
                    <p key={j} className="mt-1 text-xs text-white/70 line-clamp-3">
                      {snippet}
                    </p>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {context.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/40">
            Retrieved threat knowledge
          </p>
          <ul className="mt-2 space-y-2">
            {context.slice(0, 5).map((item, i) => (
              <li
                key={i}
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
              >
                <div className="text-xs text-white/40">
                  <span className="font-mono">{item.source}</span>
                  {item.linked_to && ` · ${item.linked_to}`}
                </div>
                <p className="mt-1 text-white/70 line-clamp-4">{item.text}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
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
            </li>
          );
        })}
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
