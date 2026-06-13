// Offline verification of the pure analysis logic (no network needed).
// Run: npx tsc scripts/verify-scanner.ts lib/scanner/*.ts --outDir <tmp> ... && node <tmp>/scripts/verify-scanner.js
import {
  checkAuth,
  checkCors,
  checkDebugArtifacts,
  checkHeaders,
  checkInfoDisclosure,
  checkInputValidation,
  checkSsl,
} from "../lib/scanner/checks";
import { checkSecrets } from "../lib/scanner/secrets";
import { buildReport } from "../lib/scanner/score";
import type { ScanContext } from "../lib/scanner/types";

const ctx: ScanContext = {
  target: new URL("https://demo-vibe-app.example"),
  finalUrl: "https://demo-vibe-app.example",
  status: 200,
  headers: {
    "access-control-allow-origin": "*",
    "access-control-allow-credentials": "true",
    "x-powered-by": "Express",
    "set-cookie": "session=abc123; Path=/",
  },
  html: `<html><body><form></form>
    <script src="/static/app.js"></script>
    <img src="http://cdn.example/logo.png"></body></html>`,
  scriptUrls: ["https://demo-vibe-app.example/static/app.js"],
  bundleSource: `
    const aws = "AKIAIOSFODNN7EXAMPLE";
    const openai = "sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const api = "http://localhost:5000/api";
    el.innerHTML = userInput;
    //# sourceMappingURL=app.js.map
  `,
  notes: [],
};

const { secrets, ai, database } = checkSecrets(ctx);
const categories = [
  { id: "database" as const, label: "Database Security", findings: database, passed: database.length === 0 },
  secrets,
  checkHeaders(ctx),
  checkCors(ctx),
  checkInfoDisclosure(ctx),
  checkDebugArtifacts(ctx),
  checkInputValidation(ctx),
  checkAuth(ctx),
  checkSsl(ctx),
  { id: "ai-risks" as const, label: "AI-Specific Risks", findings: ai, passed: ai.length === 0 },
];

const report = buildReport(ctx.finalUrl, categories, 1234, []);
console.log(`GRADE: ${report.grade}  SCORE: ${report.score}`);
console.log("SUMMARY:", JSON.stringify(report.summary));
console.log("FINDINGS:");
for (const c of report.categories) {
  for (const f of c.findings) {
    console.log(`  [${f.severity.toUpperCase().padEnd(8)}] ${f.title}`);
  }
}
const ok =
  report.grade === "F" &&
  report.summary.critical >= 2 && // AWS key + OpenAI key + wildcard-cors-with-creds
  report.summary.total >= 8;
console.log(ok ? "\nVERIFY: PASS ✅" : "\nVERIFY: FAIL ❌");
process.exit(ok ? 0 : 1);
