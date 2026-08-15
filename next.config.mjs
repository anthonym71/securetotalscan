/** @type {import('next').NextConfig} */

// Mirror of lib/security/headers.ts. Kept literal because next.config.mjs is
// evaluated by Node before the TypeScript build, so it cannot import from lib/.
// If you change one, change the other (CI has no way to catch drift).
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self'",
  "connect-src 'self'",
  "frame-src https://demo.arcade.software",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  // Replaces the hosting platform's default `access-control-allow-origin: *`.
  { key: "Access-Control-Allow-Origin", value: "https://securetotalscan.com" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Allow accessing the dev server from other devices on the local network
  // (e.g. viewing on your phone at http://192.168.1.21:3001). Dev-only.
  allowedDevOrigins: ["192.168.1.21", "192.168.1.*"],
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        source: "/.well-known/security.txt",
        headers: [
          ...SECURITY_HEADERS,
          { key: "Content-Type", value: "text/plain; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
