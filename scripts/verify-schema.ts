// Offline checks on the schema and the migration set.
//
// No database required — these read the SQL as text. They exist because the
// failure modes they cover are all silent: a migration edited after it ran, a
// customer-owned table with no way to scope a query to its owner, money stored
// as a float. Each is invisible until it is expensive.
//
// Run: npm run verify:schema

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { checksum, loadMigrations } from "./migrate";

let failures = 0;

function check(name: string, condition: boolean) {
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}`);
  if (!condition) failures += 1;
}

const root = join(__dirname, "..", "..");
const migrations = loadMigrations(join(root, "migrations"));

/**
 * Migration SQL with `--` comments removed.
 *
 * The comments explain *why* money is not a float and why timestamps carry a
 * zone — so they contain the words "float" and "timestamp", and a check
 * looking for those words finds the explanation rather than a column. The
 * documentation of a rule must not trip the check enforcing it.
 */
const allSql = migrations
  .map((m) => m.sql.replace(/--.*$/gm, ""))
  .join("\n");

console.log("Schema and migrations — offline checks\n");

// ── 1. The migration set itself ──────────────────────────────────────────

console.log("Migration files:");
check("at least one migration exists", migrations.length > 0);
check(
  "every file is zero-padded and ordered",
  migrations.every((m) => /^\d{4}_[a-z0-9_]+\.sql$/.test(m.name)),
);
check(
  "names are unique",
  new Set(migrations.map((m) => m.name)).size === migrations.length,
);
check(
  "checksums are stable across line endings",
  checksum("SELECT 1;\nSELECT 2;\n") === checksum("SELECT 1;\r\nSELECT 2;\r\n"),
);
check(
  "checksums differ on a real change",
  checksum("SELECT 1;") !== checksum("SELECT 2;"),
);

// ── 2. Tenant isolation is structurally possible ─────────────────────────
//
// PR 3.4 has to prove customer A cannot read customer B's data. That proof is
// only possible if every table holding customer data can be scoped to its
// owner and indexed for it — a table that stores customer data with no
// customer_id cannot be secured after the fact without a migration.

console.log("\nEvery customer-owned table can be scoped to its owner:");
const CUSTOMER_OWNED = ["subscription", "site", "scan", "report", "purchase", "event_log"];
for (const table of CUSTOMER_OWNED) {
  const body = new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\n\\);`).exec(allSql)?.[1] ?? "";
  check(`${table} has a customer_id column`, /customer_id\s+uuid/.test(body));
  check(
    `${table} references customer(id)`,
    /customer_id[^,]*REFERENCES customer\(id\)/.test(body),
  );
  check(
    `${table} is indexed on customer_id`,
    new RegExp(`CREATE INDEX ${table}_customer_idx ON ${table} \\(customer_id\\)`).test(allSql),
  );
}

// ── 3. Money ─────────────────────────────────────────────────────────────

console.log("\nMoney is never a float:");
check(
  "no float/real/double column anywhere",
  !/\b(float|real|double precision|numeric\s*\(\s*\d+\s*,\s*\d+\s*\))\b/i.test(allSql),
);
check(
  "purchase amounts are integer minor units",
  /amount_cents\s+integer/.test(allSql),
);
check(
  "purchase amounts cannot be negative",
  /purchase_amount_nonneg CHECK \(amount_cents >= 0\)/.test(allSql),
);
// A deep scan costs about $0.004 (PR 0.6). Stored in cents, every scan rounds
// to zero and the whole measurement becomes unusable.
check(
  "scan cost has sub-cent resolution",
  /cost_usd_micros\s+bigint/.test(allSql),
);

// ── 4. Time ──────────────────────────────────────────────────────────────

console.log("\nTime:");
check(
  "no naive timestamp columns",
  !/\btimestamp\b(?!tz)/i.test(allSql.replace(/timestamptz/g, "")),
);
check(
  "scans carry an expiry",
  /expires_at\s+timestamptz NOT NULL/.test(allSql),
);
check(
  "the expiry is six months, per PRD §5.7",
  /now\(\) \+ interval '6 months'/.test(allSql),
);
check(
  "expiry is indexed, so the Phase 4 deletion job can find rows",
  /CREATE INDEX scan_expires_idx ON scan \(expires_at\)/.test(allSql),
);

// ── 5. Idempotency at the money boundary ─────────────────────────────────
//
// Payment webhooks are delivered more than once as a matter of routine.

console.log("\nWebhook replays cannot double-record:");
check(
  "purchase.external_id is unique",
  /CREATE UNIQUE INDEX purchase_external_id_key/.test(allSql),
);
check(
  "subscription.external_id is unique",
  /CREATE UNIQUE INDEX subscription_external_id_key/.test(allSql),
);

// ── 6. Email identity ────────────────────────────────────────────────────

console.log("\nEmail identity matches how the code compares addresses:");
// Everywhere else does `email.trim().toLowerCase()`. A case-sensitive unique
// index would let Alice@ and alice@ become two customers with two histories.
check(
  "customer email is unique case-insensitively",
  /CREATE UNIQUE INDEX customer_email_lower_key ON customer \(lower\(email\)\)/.test(allSql),
);

// ── 7. Enumerated values are constrained ─────────────────────────────────

console.log("\nStatus columns cannot hold a typo:");
for (const constraint of [
  "subscription_status_check",
  "purchase_status_check",
  "scan_kind_check",
  "scan_grade_check",
]) {
  check(`${constraint} exists`, allSql.includes(constraint));
}

// ── 8. Nothing reads the database yet ────────────────────────────────────
//
// PR 2.1 is schema only. If a route had started querying, this PR would be a
// behaviour change wearing a migration's clothes.

console.log("\nThis PR changes no behaviour:");
{
  const routes = ["app/api/scan/route.ts", "app/api/lead/route.ts", "app/api/auth/login/route.ts"];
  const importsDb = routes.filter((r) =>
    /from "@\/lib\/db/.test(readFileSync(join(root, r), "utf8")),
  );
  check(
    `no API route imports the database yet (${importsDb.join(", ") || "none do"})`,
    importsDb.length === 0,
  );
}

console.log(
  failures === 0 ? "\nVERIFY: PASS ✅" : `\nVERIFY: FAIL ❌ (${failures} checks)`,
);
process.exit(failures === 0 ? 0 : 1);
