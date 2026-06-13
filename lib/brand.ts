// ──────────────────────────────────────────────────────────────
// Single source of truth for all branding. Change values here and
// they propagate to the UI, metadata, footer, and security.txt.
// ──────────────────────────────────────────────────────────────

export const BRAND = {
  /** Product / company display name. */
  name: "Secure Total Scan",
  /** Legal owner used in the copyright line and LICENSE. */
  legalName: "Secure Total Scan",
  /** Public-facing contact + report sender address. */
  email: "security@securetotalscan.com",
  /** Production URL (used for OpenGraph / canonical). Update on deploy. */
  url: "https://securetotalscan.com",
  /** One-line tagline. */
  tagline: "Your AI-built app works. But is it safe?",
  /** Year shown in the footer copyright. */
  year: 2026,
} as const;

export const COPYRIGHT = `© ${BRAND.year} ${BRAND.legalName}. All rights reserved.`;
