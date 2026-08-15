// ──────────────────────────────────────────────────────────────
// Single source of truth for the security headers applied to every
// response. Used by middleware.ts (runtime) and next.config.mjs keeps
// a static mirror for assets that bypass middleware.
// ──────────────────────────────────────────────────────────────

/** Origins we intentionally embed or talk to. Keep this list minimal. */
const ARCADE_EMBED = "https://demo.arcade.software";
const GOOGLE_FONTS_CSS = "https://fonts.googleapis.com";
const GOOGLE_FONTS_FILES = "https://fonts.gstatic.com";

/**
 * Content-Security-Policy.
 *
 * script-src keeps 'unsafe-inline' because Next.js injects its hydration
 * bootstrap inline on statically pre-rendered pages. Moving to a nonce
 * requires per-request rendering of the landing page; that is a follow-up,
 * not a safe same-day change. Everything else is locked to same-origin.
 */
export function buildCsp(): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline'",
    `style-src 'self' 'unsafe-inline' ${GOOGLE_FONTS_CSS}`,
    `font-src 'self' data: ${GOOGLE_FONTS_FILES}`,
    "img-src 'self' data: blob:",
    "media-src 'self'",
    "connect-src 'self'",
    `frame-src ${ARCADE_EMBED}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/** Canonical site origin, used to replace the wildcard CORS policy. */
export const SITE_ORIGIN = "https://securetotalscan.com";

export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": buildCsp(),
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-site",
  "X-DNS-Prefetch-Control": "off",
  "X-Permitted-Cross-Domain-Policies": "none",
  // Replaces the platform default of `access-control-allow-origin: *`.
  "Access-Control-Allow-Origin": SITE_ORIGIN,
};
