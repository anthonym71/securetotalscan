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

import { checksum, loadMigrations, splitStatements } from "./migrate";

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

// ── 8. How a route is allowed to touch the database ──────────────────────
//
// PR 2.1 asserted here that no route imported the database at all, because
// that PR was schema only. PR 2.2 is the release that makes a route a writer,
// so the check is replaced rather than deleted — the successor is the rule
// that actually matters once writes exist.
//
// On Vercel a function may freeze the moment its response is returned, so a
// bare `void promise` is not "fire and forget", it is "fire and possibly
// nothing at all". Any database write on a request path therefore has to be
// handed to `after()`, or the row is written only when the platform happens to
// keep the instance warm — which is the worst kind of bug, because it works
// perfectly in every test and loses a random fraction of production.

console.log("\nDatabase writes on a request path go through after():");
{
  const routes = ["app/api/scan/route.ts", "app/api/lead/route.ts", "app/api/auth/login/route.ts"];
  for (const route of routes) {
    const src = readFileSync(join(root, route), "utf8");
    if (!/from "@\/lib\/db/.test(src)) {
      check(`${route} does not touch the database`, true);
      continue;
    }
    check(`${route} imports after() from next/server`, /\bafter\b[^;]*from "next\/server"/.test(src));
    check(`${route} does not call recordScan outside after()`, !/void\s+recordScan\s*\(/.test(src));
    // `after(` must appear before the call, on the same expression. Flattening
    // whitespace lets the two sit on different lines, which they always do.
    const flat = src.replace(/\s+/g, " ");
    check(
      `${route} calls recordScan inside an after() callback`,
      /after\(\s*\(\)\s*=>[^;]{0,400}recordScan\(/.test(flat),
    );
  }
}

// ── 9. Empty-string environment variables ───────────────────────────────
//
// GitHub Actions sets an env var to the EMPTY STRING when the secret behind it
// does not exist. `??` only falls back on null/undefined, so
// `A ?? B` resolves to "" and never reaches B — which is how the first CD run
// after PR 2.1 refused to migrate while DATABASE_URL was populated and sitting
// right there. `||` is the correct operator for anything sourced from the
// environment.

console.log("\nEnvironment fallbacks tolerate an empty string:");
{
  const sources = ["scripts/migrate.ts", "lib/db/client.ts"];
  for (const file of sources) {
    const text = readFileSync(join(root, file), "utf8");
    const nullish = /process\.env\.\w+\s*\?\?\s*process\.env\.\w+/.exec(text);
    check(
      `${file} does not chain process.env with ?? ` +
        (nullish ? `— FOUND: ${nullish[0]}` : ""),
      nullish === null,
    );
  }

  // And prove the semantics, so the rule is not just a grep.
  const emptyThenReal = (a: string, b: string) => a || b;
  check("|| falls through an empty string", emptyThenReal("", "real") === "real");
  check("|| keeps a real value", emptyThenReal("first", "second") === "first");
}

// ── 10. Statement splitting ─────────────────────────────────────────────
//
// Neon's HTTP driver sends each query as a prepared statement, and Postgres
// refuses more than one command in one. A migration file therefore has to
// arrive as a list of statements — and splitting SQL on `;` is a classic way
// to corrupt a migration, so the splitter is tested rather than trusted.

console.log("\nMigration files split into individual statements:");
{
  for (const migration of migrations) {
    const statements = splitStatements(migration.sql);
    check(
      `${migration.name} yields ${statements.length} statement(s)`,
      statements.length > 1,
    );
    check(
      `${migration.name}: no statement still contains a bare semicolon`,
      statements.every((st) => !/;\s*\S/.test(st.replace(/--[^\n]*/g, ""))),
    );
    check(
      `${migration.name}: no statement is only a comment`,
      statements.every((st) => !/^(?:--[^\n]*\n?|\s)*$/.test(st)),
    );
    check(
      `${migration.name}: every statement starts with a keyword`,
      statements.every((st) =>
        /^(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|COMMENT|GRANT|SET|--)/i.test(st.trim()),
      ),
    );
  }

  // The three places a semicolon is not a terminator.
  check(
    "a semicolon inside a string literal does not split",
    splitStatements("SELECT 'a;b'; SELECT 2;").length === 2,
  );
  check(
    "a doubled quote inside a literal is handled",
    splitStatements("SELECT 'it''s; fine'; SELECT 2;").length === 2,
  );
  check(
    "a semicolon inside a line comment does not split",
    splitStatements("SELECT 1; -- trailing; comment\nSELECT 2;").length === 2,
  );
  check(
    "a dollar-quoted block does not split",
    splitStatements("CREATE FUNCTION f() RETURNS void AS $$ BEGIN a; b; END $$ LANGUAGE plpgsql; SELECT 1;")
      .length === 2,
  );
  check(
    "a tagged dollar quote does not split",
    splitStatements("DO $mig$ BEGIN x; END $mig$; SELECT 1;").length === 2,
  );
  check(
    "a final statement without a semicolon is kept",
    splitStatements("SELECT 1; SELECT 2").length === 2,
  );
  check("a comment-only tail is dropped", splitStatements("SELECT 1;\n-- done\n").length === 1);
  check("empty input yields nothing", splitStatements("   \n  ").length === 0);
}

console.log(
  failures === 0 ? "\nVERIFY: PASS ✅" : `\nVERIFY: FAIL ❌ (${failures} checks)`,
);
process.exit(failures === 0 ? 0 : 1);
