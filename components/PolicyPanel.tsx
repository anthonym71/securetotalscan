import type { ComplianceGap, RagContextItem } from "@/lib/api";
import {
  contextForControl,
  frameworkBadgeClass,
  groupPoliciesByFramework,
} from "@/lib/policies";

const SEV_STYLE: Record<string, string> = {
  critical: "text-grade-f border-grade-f/40 bg-grade-f/10",
  high: "text-grade-d border-grade-d/40 bg-grade-d/10",
  medium: "text-grade-c border-grade-c/40 bg-grade-c/10",
  low: "text-grade-a border-grade-a/40 bg-grade-a/10",
};

function severityClass(severity: string | undefined): string {
  return SEV_STYLE[(severity ?? "").toLowerCase()] ?? "text-white/60 border-white/15 bg-white/5";
}

export function PolicyPanel({
  gaps,
  complianceContext,
  complianceScore,
  ragReady,
}: {
  gaps?: ComplianceGap[];
  complianceContext?: RagContextItem[];
  complianceScore?: number;
  ragReady?: boolean;
}) {
  const groups = groupPoliciesByFramework(gaps);

  if (!groups.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-card-gradient p-5 text-sm text-white/50">
        No policy gaps detected for this scan.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
        <div>
          <h3 className="font-semibold text-white">Policy & compliance</h3>
          <p className="mt-1 text-xs text-white/50">
            Gaps mapped to NIST CSF and SOC 2 controls, enriched with RAG-retrieved
            policy guidance from the knowledge base.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-white/40">Compliance score</div>
          <div className="text-2xl font-bold text-white">{complianceScore ?? 0}%</div>
        </div>
      </div>

      {!ragReady && (
        <div className="rounded-xl border border-grade-c/30 bg-grade-c/10 px-4 py-3 text-sm text-grade-c">
          Knowledge base not indexed — policy guidance may be limited. Re-index from the
          dashboard before running analysis.
        </div>
      )}

      {groups.map(({ framework, gaps: fwGaps }) => (
        <section key={framework} className="space-y-3">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wide ${frameworkBadgeClass(framework)}`}
            >
              {framework}
            </span>
            <span className="text-sm text-white/40">
              {fwGaps.length} control{fwGaps.length === 1 ? "" : "s"}
            </span>
          </div>

          <ul className="space-y-3">
            {fwGaps.map((gap, i) => (
              <PolicyCard
                key={`${gap.control_id}-${i}`}
                gap={gap}
                ragChunks={contextForControl(gap.control_id, complianceContext)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function PolicyCard({
  gap,
  ragChunks,
}: {
  gap: ComplianceGap;
  ragChunks: RagContextItem[];
}) {
  const sev = (gap.severity ?? "").toLowerCase();
  const remediation = gap.rag_remediation?.trim();
  const sources = gap.rag_sources ?? [];
  const extraChunks = ragChunks.filter(
    (c) => !remediation || !remediation.includes(c.text.slice(0, 80)),
  );

  return (
    <li className="rounded-2xl border border-white/10 bg-card-gradient p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-black/40 px-2 py-0.5 text-sm font-semibold text-brand-light">
              {gap.control_id}
            </code>
            {sev && (
              <span
                className={`rounded border px-2 py-0.5 text-xs font-semibold uppercase ${severityClass(sev)}`}
              >
                {sev}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-white/80">{gap.description}</p>
        </div>
      </div>

      {(remediation || extraChunks.length > 0) && (
        <div className="mt-4 rounded-xl border border-brand/20 bg-brand/5 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-light">
            <span className="rounded bg-brand/20 px-1.5 py-0.5">RAG</span>
            Policy guidance
          </div>

          {remediation && (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/75">
              {remediation}
            </p>
          )}

          {extraChunks.map((chunk, idx) => (
            <div
              key={`${chunk.source}-${idx}`}
              className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3"
            >
              <div className="flex flex-wrap gap-2 text-xs text-white/40">
                <span className="font-mono">{chunk.source}</span>
                {chunk.score != null && <span>· relevance {chunk.score.toFixed(2)}</span>}
              </div>
              <p className="mt-1 text-sm text-white/70 line-clamp-6">{chunk.text}</p>
            </div>
          ))}

          {sources.length > 0 && (
            <p className="mt-3 text-xs text-white/40">
              Sources: {sources.join(" · ")}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
