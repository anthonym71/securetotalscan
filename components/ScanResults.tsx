import type { Finding, Grade, ScanReport, Severity } from "@/lib/scanner/types";
import { LeadCapture } from "./LeadCapture";

const GRADE_COLOR: Record<Grade, string> = {
  A: "text-grade-a border-grade-a",
  B: "text-grade-b border-grade-b",
  C: "text-grade-c border-grade-c",
  D: "text-grade-d border-grade-d",
  F: "text-grade-f border-grade-f",
};

const SEV_STYLE: Record<Severity, string> = {
  critical: "bg-grade-f/15 text-grade-f border-grade-f/30",
  high: "bg-grade-d/15 text-grade-d border-grade-d/30",
  medium: "bg-grade-c/15 text-grade-c border-grade-c/30",
  low: "bg-grade-b/15 text-grade-b border-grade-b/30",
  info: "bg-white/10 text-white/70 border-white/20",
};

const SEV_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

export function ScanResults({ report }: { report: ScanReport }) {
  const allFindings = report.categories
    .flatMap((c) => c.findings)
    .sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));

  return (
    <div className="mt-8 animate-fade-in space-y-8">
      {/* Grade header */}
      <div className="flex flex-col items-center gap-6 rounded-2xl border border-white/10 bg-card-gradient p-8 sm:flex-row sm:items-center">
        <div
          className={`flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl border-4 ${GRADE_COLOR[report.grade]} bg-black/30 text-6xl font-extrabold`}
        >
          {report.grade}
        </div>
        <div className="flex-1 text-center sm:text-left">
          <p className="text-sm uppercase tracking-widest text-white/50">
            Security grade
          </p>
          <p className="mt-1 break-all text-lg font-semibold">{report.url}</p>
          <p className="mt-2 text-white/60">
            Score {report.score}/100 · {report.summary.total} issue
            {report.summary.total === 1 ? "" : "s"} found · scanned in{" "}
            {(report.durationMs / 1000).toFixed(1)}s
          </p>
        </div>
      </div>

      {/* Lead capture: email the full report (feeds GoHighLevel CRM) */}
      <LeadCapture url={report.url} grade={report.grade} score={report.score} />

      {/* Severity summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {SEV_ORDER.map((sev) => (
          <div
            key={sev}
            className={`rounded-xl border px-4 py-3 text-center ${SEV_STYLE[sev]}`}
          >
            <div className="text-2xl font-bold">{report.summary[sev]}</div>
            <div className="text-xs uppercase tracking-wide">{sev}</div>
          </div>
        ))}
      </div>

      {/* Findings */}
      {allFindings.length === 0 ? (
        <div className="rounded-2xl border border-grade-a/30 bg-grade-a/10 p-6 text-center">
          <p className="text-lg font-semibold text-grade-a">
            No issues detected in the passive scan. 🎉
          </p>
          <p className="mt-1 text-sm text-white/60">
            This is a good sign, but it is not a guarantee. Keep auth, server-side
            validation, and dependency updates under review.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {allFindings.map((f, i) => (
            <FindingCard key={i} finding={f} />
          ))}
        </ul>
      )}

      {report.notes.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/50">
          <p className="mb-1 font-medium text-white/70">Notes</p>
          <ul className="list-inside list-disc space-y-1">
            {report.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <li className="rounded-xl border border-white/10 bg-card-gradient p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${SEV_STYLE[finding.severity]}`}
        >
          {finding.severity}
        </span>
        <h4 className="text-base font-semibold">{finding.title}</h4>
      </div>
      <p className="mt-2 text-sm text-white/70">{finding.detail}</p>
      {finding.evidence && (
        <p className="mt-2 break-all rounded-lg bg-black/40 px-3 py-2 font-mono text-xs text-white/60">
          {finding.evidence}
        </p>
      )}
      <details className="mt-3 group">
        <summary className="cursor-pointer text-sm font-medium text-brand-light hover:text-white">
          Fix prompt →
        </summary>
        <p className="mt-2 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-white/80">
          {finding.fixPrompt}
        </p>
      </details>
    </li>
  );
}
