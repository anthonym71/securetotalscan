import type { Metadata } from "next";
import { LoginForm } from "@/components/LoginForm";
import { isAccessConfigured } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — Secure Total Scan",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const configured = isAccessConfigured();
  const target = next && next.startsWith("/") ? next : "/dashboard";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8">
        <h1 className="text-2xl font-bold">Agent dashboard</h1>
        <p className="mt-2 text-sm text-white/60">
          The five-agent deep analysis is available to customers with an active
          plan. Sign in to continue.
        </p>
        <div className="mt-6">
          {configured ? (
            <LoginForm next={target} />
          ) : (
            <div className="rounded-xl border border-grade-c/40 bg-grade-c/10 p-4 text-sm text-white/80">
              <p className="font-semibold">Access is not configured yet.</p>
              <p className="mt-2 text-white/60">
                Set <code>STS_ACCESS_CODES</code> in the deployment environment
                to issue access codes. Until then the dashboard stays closed.
              </p>
            </div>
          )}
        </div>
      </div>
      <p className="mt-6 text-center text-sm text-white/40">
        <a href="/" className="underline hover:text-white/70">
          ← Back to the free scan
        </a>
      </p>
    </main>
  );
}
