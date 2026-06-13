import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  title: `${BRAND.name} — security for anything exposed to the internet`,
  description:
    "If it's online, it can leak. Scan any website, app, GitHub repo, or log file. A free surface scan grades you A to F, and five autonomous agents run the deep analysis with copy-paste fixes.",
  applicationName: BRAND.name,
  keywords: [
    "security scanner",
    "AI code security",
    "GitHub repo scan",
    "exposed API keys",
    "vulnerability scanner",
    "SOC 2 NIST compliance",
  ],
  openGraph: {
    title: `${BRAND.name} — security for anything exposed to the internet`,
    description:
      "Free surface scan plus a five-agent deep analysis. Find what's exposed before someone else does.",
    type: "website",
    url: BRAND.url,
    siteName: BRAND.name,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
