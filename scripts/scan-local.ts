// Run the surface scanner from the command line.
//
//   npm run scan -- https://example.com
//   npm run scan -- http://localhost:3000 --allow-loopback
//
// --allow-loopback exists so a developer can scan an app on their own machine.
// It admits localhost, 127.0.0.0/8 and ::1 only; private, link-local and
// metadata addresses stay refused. The web API never sets it.

import { scan } from "../lib/scanner";

async function main() {
  const args = process.argv.slice(2);
  const allowLoopback = args.includes("--allow-loopback");
  const json = args.includes("--json");
  const target = args.find((a) => !a.startsWith("--"));
  if (!target) {
    console.error("usage: npm run scan -- <url> [--allow-loopback] [--json]");
    process.exit(2);
  }

  const report = await scan(target, { allowLoopback });
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`${report.url}  grade ${report.grade}  score ${report.score}  (${report.durationMs} ms)`);
  console.log(
    `findings: ${report.summary.critical} critical, ${report.summary.high} high, ` +
      `${report.summary.medium} medium, ${report.summary.low} low, ${report.summary.info} info`,
  );
  for (const category of report.categories) {
    for (const finding of category.findings) {
      console.log(`  [${finding.severity.padEnd(8)}] ${category.label}: ${finding.title}`);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
