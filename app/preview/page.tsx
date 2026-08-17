import Link from "next/link";
import { findingLabel, findingLocation, findingMeta, findingRecommendation } from "@/lib/findings";
import { SAMPLE_DEEP_ANALYSIS } from "@/lib/preview-data";

export const metadata = {
  title: "Deep agent analysis — preview | Secure Total Scan",
  description:
    "A read-only walkthrough of what the deep agent analysis produces, using a sample result.",
};

/**
 * Read-only marketing preview of the agent dashboard.
 *
 * It lives at /preview, **not** /dashboard/preview: `middleware.ts` protects
 * the whole `/dashboard` prefix, so a preview underneath it would redirect
 * prospects to /login — which is the exact bug this page replaces.
 *
 * The sample below is labelled as a sample on the page itself, in the data,
 * and in the banner. A demo that a visitor could mistake for their own result
 * is a lie with extra steps.
 */
export default function PreviewPage() {
  const report = SAMPLE_DEEP_ANALYSIS;

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/" className="text-sm text-brand-light hover:text-white">
        ← Back to home
      </Link>

      <div className="mt-6 rounded-2xl border border-grade-c/40 bg-grade-c/10 px-5 py-4">
        <p className="font-semibold text-grade-c">
          This is a sample, not a scan of your site.
        </p>
        <p className="mt-1 text-sm text-white/70">
          Every finding below comes from a fixed example run against a
          deliberately vulnerable demo application, so you can see the shape of
          the output before deciding whether it is worth paying for. Nothing on
          this page is live.
        </p>
      </div>

      <h1 className="mt-8 text-3xl font-bold">Deep agent analysis</h1>
      <p className="mt-2 text-white/60">
        Six agents run over a repository, a container image, or your logs. Each
        reports as it finishes; the results below are what you get at the end.
      </p>

      {/* Agent pipeline */}
      <section className="mt-8">
        <h2 className="text-sm uppercase tracking-widest text-white/50">
          Pipeline
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {report.agents.map((agent) => (
            <div
              key={agent.name}
              className="rounded-xl border border-grade-a/40 bg-black/20 px-4 py-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{agent.label}</span>
                <span className="text-xs text-grade-a">done</span>
              </div>
              <p className="mt-1 text-xs text-white/40">{agent.summary}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Risk header */}
      <section className="mt-8 rounded-2xl border border-white/10 bg-card-gradient p-6">
        <p className="text-sm uppercase tracking-widest text-white/50">
          Overall risk
        </p>
        <p className="mt-1 text-3xl font-bold text-grade-f">
          {report.riskLevel}
        </p>
        <p className="mt-2 text-white/60">
          {report.totalFindings} findings across {report.sections.length}{" "}
          categories, from {report.source}.
        </p>
      </section>

      {/* Findings, rendered by the same helpers the real dashboard uses, so
          the preview cannot drift from the product it is advertising. */}
      {report.sections.map((section) => (
        <section key={section.title} className="mt-6">
          <div className="rounded-2xl border border-white/10 bg-card-gradient p-5">
            <h3 className="font-semibold">
              {section.title}{" "}
              <span className="text-white/40">({section.items.length})</span>
            </h3>
            <ul className="mt-3 space-y-2">
              {section.items.map((item, i) => {
                const label = findingLabel(item);
                const meta = findingMeta(item);
                const where = findingLocation(item);
                const recommendation = findingRecommendation(item);
                const severity = String(item.severity ?? "").toLowerCase();
                return (
                  <li
                    key={i}
                    className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
                  >
                    {severity && (
                      <span className="mr-2 font-semibold text-grade-d">
                        [{severity}]
                      </span>
                    )}
                    <span className="text-white/75">{label}</span>
                    {meta && (
                      <span className="ml-2 font-mono text-xs text-white/40">
                        {meta}
                      </span>
                    )}
                    {where && (
                      <span className="ml-2 font-mono text-xs text-white/40">
                        {where}
                      </span>
                    )}
                    {recommendation && (
                      <p className="mt-1 text-xs text-white/50">
                        {recommendation}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ))}

      <section className="mt-10 rounded-2xl border border-brand/30 bg-brand/10 p-6 text-center">
        <p className="text-lg font-semibold">
          Want this run against your own code?
        </p>
        <p className="mt-1 text-sm text-white/70">
          The deep analysis is part of the paid tiers. The surface scan is free
          and needs no account.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link
            href="/#pricing"
            className="rounded-xl bg-brand-gradient px-7 py-3.5 font-semibold text-white shadow-glow transition hover:opacity-90"
          >
            See pricing
          </Link>
          <Link
            href="/#scan"
            className="rounded-xl border border-white/20 px-7 py-3.5 font-semibold text-white/80 transition hover:bg-white/5"
          >
            Run a free surface scan
          </Link>
        </div>
      </section>
    </main>
  );
}
