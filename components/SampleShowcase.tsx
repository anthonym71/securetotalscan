import type { Grade, PublicFinding, Severity } from "@/lib/scanner/types";
import { sampleFreeReport } from "@/lib/scanner/sampleReport";

// This is a server component. It renders the *public* sample only — the fixture
// with the full prompts is private to lib/scanner/sampleReport.ts and never
// crosses to the client. The lock states below are real: for a locked finding
// there is no prompt text in the markup to reveal, because the projection never
// carried one.

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

export function SampleShowcase() {
  const report = sampleFreeReport();
  const findings = report.categories
    .flatMap((c) => c.findings)
    .sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));

  return (
    <section id="sample-report" className="mx-auto max-w-5xl px-6 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-light">
          See a real report
        </p>
        <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
          This is exactly what you get
        </h2>
        <p className="mx-auto mt-4 text-white/60">
          A real free scan of a demo store. Every finding in full, one fix prompt
          unlocked so you can judge the quality, and the rest ready the moment you
          upgrade. No signup to look.
        </p>
      </div>

      {/* The report, framed like a document a person would recognise. */}
      <div className="mt-10 overflow-hidden rounded-2xl border border-white/10 bg-ink shadow-glow">
        {/* Window chrome — a small cue that this is the artifact itself. */}
        <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-5 py-3">
          <span className="h-3 w-3 rounded-full bg-grade-f/70" aria-hidden />
          <span className="h-3 w-3 rounded-full bg-grade-c/70" aria-hidden />
          <span className="h-3 w-3 rounded-full bg-grade-a/70" aria-hidden />
          <span className="ml-3 truncate font-mono text-xs text-white/40">
            secure-total-scan — {report.url}
          </span>
        </div>

        <div className="space-y-8 p-6 sm:p-8">
          {/* Grade header */}
          <div className="flex flex-col items-center gap-6 rounded-2xl border border-white/10 bg-card-gradient p-6 sm:flex-row">
            <div
              className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border-4 bg-black/30 text-5xl font-extrabold ${GRADE_COLOR[report.grade]}`}
            >
              {report.grade}
            </div>
            <div className="flex-1 text-center sm:text-left">
              <p className="text-xs uppercase tracking-widest text-white/50">
                Security grade
              </p>
              <p className="mt-1 break-all text-lg font-semibold">{report.url}</p>
              <p className="mt-2 text-white/60">
                Score {report.score}/100 · {report.summary.total} issues found ·
                scanned in {(report.durationMs / 1000).toFixed(1)}s
              </p>
            </div>
          </div>

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

          {/* The pitch, stated plainly and up front. */}
          {report.lockedPromptCount > 0 && (
            <div className="rounded-xl border border-brand/30 bg-brand/10 p-4 text-sm">
              <p className="font-medium text-white/90">
                {report.lockedPromptCount} fix prompts are locked. One is unlocked
                below so you can see the quality before you pay.
              </p>
              <p className="mt-1 text-white/60">
                Each prompt is a specific, copy-paste instruction for your AI tool,
                written against what the scan actually found — not generic advice.
              </p>
            </div>
          )}

          {/* Findings */}
          <ul className="space-y-3">
            {findings.map((f, i) => (
              <FindingRow key={i} finding={f} />
            ))}
          </ul>
        </div>
      </div>

      {/* Conversion band */}
      <div className="mt-8 flex flex-col items-center gap-4 rounded-2xl border border-brand/30 bg-brand/10 p-6 text-center sm:flex-row sm:justify-between sm:text-left">
        <div>
          <p className="text-lg font-semibold">
            Unlock all {report.lockedPromptCount} fix prompts for this report
          </p>
          <p className="mt-1 text-sm text-white/60">
            Every finding gets a written, copy-paste fix. See the plans, or take
            the sample with you.
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
          <a
            href="#pricing"
            className="rounded-xl bg-brand-gradient px-6 py-3 text-center font-semibold text-white shadow-glow transition hover:opacity-90"
          >
            Unlock the full report →
          </a>
          <a
            href="/api/sample-report"
            className="rounded-xl border border-white/15 px-6 py-3 text-center font-semibold text-white/80 transition hover:border-white/30 hover:text-white"
          >
            Download the sample (PDF)
          </a>
        </div>
      </div>
    </section>
  );
}

function FindingRow({ finding }: { finding: PublicFinding }) {
  return (
    <li className="rounded-xl border border-white/10 bg-card-gradient p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${SEV_STYLE[finding.severity]}`}
        >
          {finding.severity}
        </span>
        <h3 className="text-base font-semibold">{finding.title}</h3>
      </div>
      <p className="mt-2 text-sm text-white/70">{finding.detail}</p>
      {finding.evidence && (
        <p className="mt-2 break-all rounded-lg bg-black/40 px-3 py-2 font-mono text-xs text-white/60">
          {finding.evidence}
        </p>
      )}

      {/* The signature moment: the one unlocked prompt shown in full, and the
          locked ones beside it. The visual difference is the sales argument. */}
      {finding.fixPrompt ? (
        <div className="mt-3 rounded-lg border border-brand/40 bg-brand/10 p-3 shadow-glow">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-light">
            ✓ Unlocked sample — paste this into your AI tool
          </p>
          <p className="mt-1.5 text-sm text-white/85">{finding.fixPrompt}</p>
        </div>
      ) : finding.promptLocked ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm text-white/40">
            <span aria-hidden>🔒</span>
            Fix prompt locked
          </span>
          <span className="text-xs font-medium text-brand-light">
            Pro unlocks this
          </span>
        </div>
      ) : null}
    </li>
  );
}
