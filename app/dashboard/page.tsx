"use client";

import { useRef, useState } from "react";
import {
  AGENT_LABELS,
  AgentEvent,
  SecurityReport,
  analyzeGithub,
  getEvals,
  getReport,
  streamUrl,
} from "@/lib/api";

const PIPELINE = [
  "log_monitor",
  "threat_intel",
  "vuln_scanner",
  "incident_response",
  "policy_checker",
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

export default function Dashboard() {
  const [repo, setRepo] = useState("");
  const [status, setStatus] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SecurityReport | null>(null);
  const [evals, setEvals] = useState<Record<string, unknown> | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const doneRef = useRef(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!repo.trim() || running) return;
    setRunning(true);
    setError(null);
    setReport(null);
    setEvals(null);
    setStatus(Object.fromEntries(PIPELINE.map((a) => [a, "pending"])));
    doneRef.current = false;
    esRef.current?.close();

    try {
      const { session_id } = await analyzeGithub(repo.trim());
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
            "Lost connection to the agent backend. Confirm it's running and NEXT_PUBLIC_API_URL points to it.",
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
        Run the five-agent deep analysis on a public GitHub repository. Each
        agent reports live as it finishes.
      </p>

      <form
        onSubmit={run}
        className="mt-6 flex flex-col gap-3 rounded-2xl border border-white/10 bg-card-gradient p-3 sm:flex-row"
      >
        <input
          type="text"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="github.com/you/your-repo"
          className="flex-1 rounded-xl bg-black/40 px-4 py-3.5 text-white placeholder-white/30 outline-none ring-brand/50 transition focus:ring-2"
          disabled={running}
        />
        <button
          type="submit"
          disabled={running}
          className="rounded-xl bg-brand-gradient px-7 py-3.5 font-semibold shadow-glow transition hover:opacity-90 disabled:opacity-60"
        >
          {running ? "Analyzing…" : "Run analysis"}
        </button>
      </form>

      {error && (
        <div className="mt-6 rounded-xl border border-grade-f/30 bg-grade-f/10 px-4 py-3 text-grade-f">
          {error}
        </div>
      )}

      {Object.keys(status).length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Agent pipeline</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PIPELINE.map((agent) => {
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

      {report && (
        <div className="mt-8 space-y-6 animate-fade-in">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Risk level" value={report.risk_level ?? "—"} className={RISK_STYLE[risk]} />
            <Metric label="Files scanned" value={report.files_scanned ?? 0} />
            <Metric label="Primary language" value={report.primary_language || "—"} />
            <Metric label="Compliance" value={`${report.compliance_score ?? 0}%`} />
          </div>

          <FindingList title="Code findings" items={report.code_findings} />
          <FindingList title="Vulnerabilities" items={report.vulnerabilities} />
          <FindingList title="Log anomalies" items={report.anomalies} />
          <FindingList title="Compliance gaps" items={report.compliance_gaps} />

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

      {evals && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-card-gradient p-5">
          <h2 className="text-lg font-semibold">Cost &amp; evals</h2>
          <pre className="mt-2 overflow-x-auto text-xs text-white/60">
            {JSON.stringify(evals, null, 2)}
          </pre>
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
