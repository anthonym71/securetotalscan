import Link from "next/link";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { ComplimentaryAccessPanel } from "@/components/ComplimentaryAccessPanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Owner tools — Secure Total Scan",
  robots: { index: false, follow: false },
};

export default async function OwnerPage() {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  // Middleware already bounced anonymous visitors to /login; a signed-in
  // customer lands here only by typing the URL and gets sent to their dashboard.
  if (!session) redirect("/login?next=/owner");
  if (session.role !== "owner") redirect("/dashboard");

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Owner tools</h1>
          <p className="mt-1 text-sm text-white/60">Signed in as {session.email}</p>
        </div>
        <Link href="/dashboard" className="text-sm text-white/50 underline hover:text-white/80">
          Dashboard →
        </Link>
      </div>
      <ComplimentaryAccessPanel />
    </main>
  );
}
