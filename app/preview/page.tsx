import Link from "next/link";
import { SampleAnalysis } from "@/components/SampleAnalysis";

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
 */
export default function PreviewPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/" className="text-sm text-brand-light hover:text-white">
        ← Back to home
      </Link>
      <SampleAnalysis />
    </main>
  );
}
