// Offline regression tests for customer-facing claims.
//
// Working rule 4 of the delivery plan: **no copy may claim a feature that is
// not verified working in the same release.** That rule was broken in five
// places at once, and the only thing that had been enforcing it was whether
// someone happened to reread the marketing copy.
//
// This is a grep with an argument attached. Each banned pattern names the
// claim, why it was false, and the PR that will make it true — so when the
// feature ships, the person removing the rule can see it is safe to.
//
// Run: npm run verify:claims

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FAQS, HERO, SCAN_SECTION, TRUST } from "../lib/content";

let failures = 0;

function check(name: string, condition: boolean) {
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

const root = join(__dirname, "..", "..");

function source(relative: string): string {
  return readFileSync(join(root, relative), "utf8");
}

/**
 * Source with comments removed and whitespace flattened.
 *
 * Both steps are needed and both were learned the hard way when this file
 * first ran. Comments must go, because the note explaining *why* a false claim
 * was removed quotes the claim — so the documentation of the fix would trip
 * the check enforcing it. Whitespace must be flattened, because JSX wraps a
 * sentence across lines and a phrase split by a newline would slip past.
 */
function renderedText(relative: string): string {
  return source(relative)
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/\s+/g, " ");
}

/** All customer-facing strings in lib/content.ts, flattened. */
const copy = [
  HERO.eyebrow,
  ...HERO.title,
  HERO.subtitle,
  HERO.body,
  HERO.cta,
  TRUST.headline,
  TRUST.body,
  SCAN_SECTION.title,
  SCAN_SECTION.body,
  SCAN_SECTION.button,
  SCAN_SECTION.placeholder,
  SCAN_SECTION.supports,
  ...FAQS.flatMap((f) => [f.q, f.a]),
].join("\n");

interface BannedClaim {
  pattern: RegExp;
  claim: string;
  why: string;
  liftWhen: string;
}

const BANNED: BannedClaim[] = [
  {
    pattern: /\bno limits\b/i,
    claim: '"no limits" on the free scan',
    why: "/api/scan enforces 5/hour and 20/day per IP, 10/day per email, and 10/hour per target domain.",
    liftWhen: "never — the limits are deliberate. State them instead.",
  },
  {
    pattern: /nothing is persisted/i,
    claim: '"Nothing is persisted"',
    why: "The email address entered for a scan is sent to the CRM and kept there.",
    liftWhen: "never in this form. Phase 2 states what is stored and for how long.",
  },
  {
    pattern: /your report is on its way/i,
    claim: '"Your report is on its way"',
    why: "No email is sent. /api/lead creates a CRM contact and nothing else.",
    liftWhen: "PR 2.5, when Resend delivery is live and verified.",
  },
  {
    pattern: /we email your report/i,
    claim: '"We email your report"',
    why: "Same as above — report delivery does not exist yet.",
    liftWhen: "PR 2.5.",
  },
  {
    pattern: /(?:scan|paste)[^.]{0,40}\b(?:a )?github repo/i,
    claim: "the free scanner accepting a GitHub repository",
    why:
      "The free scan takes a URL and fetches it as a web page. A GitHub URL is scanned as a page, not as a repository. Repo analysis is the paid deep-agent pipeline.",
    liftWhen: "never for the free tier; the deep analysis may say it.",
  },
];

console.log("Customer-facing claims — regression checks\n");

console.log("Claims that are not true yet must not appear in lib/content.ts:");
for (const banned of BANNED) {
  const hit = banned.pattern.exec(copy);
  check(
    `${banned.claim} — ${hit ? `FOUND: "${hit[0]}"` : "absent"}`,
    hit === null,
  );
  if (hit) {
    console.log(`        why it is false: ${banned.why}`);
    console.log(`        safe to say from: ${banned.liftWhen}`);
  }
}

// ── Component copy ────────────────────────────────────────────────────────
//
// Checked as source text rather than through the module, because these live
// inside JSX and cannot be imported without rendering React.

console.log("\nAnd not in the components either:");
{
  const rendered = renderedText("components/LeadCapture.tsx");
  check(
    "LeadCapture does not promise an email that is not sent",
    !/your report is on its way/i.test(rendered),
  );
  check(
    "LeadCapture does not say it will email the report",
    !/we&apos;ll email you the complete breakdown/i.test(rendered),
  );
}

// ── The dashboard CTA ─────────────────────────────────────────────────────

console.log("\nThe agent-dashboard CTA must not send prospects to a login wall:");
{
  const rendered = renderedText("components/Sections.tsx");
  check('no href="/dashboard" in marketing sections', !/href="\/dashboard"/.test(rendered));
  check('it points at /preview instead', /href="\/preview"/.test(rendered));

  const middleware = source("middleware.ts");
  const protectedPrefixes = /PROTECTED_PREFIXES\s*=\s*\[([^\]]*)\]/.exec(middleware)?.[1] ?? "";
  // The preview exists at /preview rather than /dashboard/preview precisely
  // because middleware protects the whole /dashboard prefix. If a future
  // change moves it under a protected prefix, prospects hit /login again.
  check(
    "/preview is not under a protected prefix",
    !protectedPrefixes.split(",").some((p) => {
      const prefix = p.trim().replace(/['"]/g, "");
      return prefix && "/preview".startsWith(prefix);
    }),
  );
}

// ── The preview must announce itself ──────────────────────────────────────

console.log("\nThe preview must be unmistakably a sample:");
{
  const preview = renderedText("app/preview/page.tsx");
  check(
    "it says so on the page",
    /this is a sample, not a scan of your site/i.test(preview),
  );
  check("and explains the data is fixed", /nothing on this page is live/i.test(preview));
}

console.log(
  failures === 0 ? "\nVERIFY: PASS ✅" : `\nVERIFY: FAIL ❌ (${failures} checks)`,
);
process.exit(failures === 0 ? 0 : 1);
