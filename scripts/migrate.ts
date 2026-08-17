// Forward-only migration runner.
//
// Deliberately small. A migration framework is a dependency with opinions
// about your schema, and this project has seven tables and one contributor —
// the framework would be larger than the thing it manages.
//
// Rules it enforces, each because the alternative is a bad afternoon:
//
//   * **Applied migrations are immutable.** The checksum of every file is
//     stored. Editing a migration that has already run changes the schema on
//     new environments and not on old ones, and nothing tells you until they
//     diverge. Editing one is an error here, not a surprise later.
//   * **One at a time, in filename order.** An advisory lock means two
//     concurrent deploys cannot both decide to run 0002.
//   * **Each migration is a transaction.** A half-applied migration is worse
//     than an unapplied one.
//
// Usage:
//   npm run migrate          # apply anything pending
//   npm run migrate -- --dry # list what would run, touch nothing

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { neon } from "@neondatabase/serverless";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "migrations");

/** Postgres advisory lock id. Arbitrary, but must be stable. */
const LOCK_ID = 728_401_553;

interface Migration {
  name: string;
  sql: string;
  checksum: string;
}

/**
 * Split a migration file into individual SQL statements.
 *
 * Neon's HTTP driver sends each query as a **prepared statement**, and
 * Postgres refuses more than one command in one — `cannot insert multiple
 * commands into a prepared statement`. So a file has to arrive as a list, not
 * a blob.
 *
 * Splitting SQL on `;` is a classic way to corrupt a migration, so this
 * respects the three places a semicolon is not a terminator:
 *
 *   * inside a single-quoted literal (`'6 months'`), including the doubled-quote
 *     escape (`'it''s'`),
 *   * inside a `--` line comment,
 *   * inside a dollar-quoted block (`$$ … $$` or `$tag$ … $tag$`), which is how
 *     functions and DO blocks are written.
 *
 * Block comments are left alone: they cannot contain a statement terminator
 * that matters, and stripping them would change the checksummed text.
 */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;

  while (i < sql.length) {
    const char = sql[i]!;
    const rest = sql.slice(i);

    // Line comment — copy to end of line.
    if (rest.startsWith("--")) {
      const end = sql.indexOf("\n", i);
      const stop = end === -1 ? sql.length : end + 1;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }

    // Single-quoted literal, honouring '' as an escaped quote.
    if (char === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") {
          j += 2;
          continue;
        }
        if (sql[j] === "'") break;
        j += 1;
      }
      current += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    // Dollar-quoted block: $$ … $$ or $tag$ … $tag$.
    const dollar = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(rest);
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end === -1 ? sql.length : end + tag.length;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }

    if (char === ";") {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
      i += 1;
      continue;
    }

    current += char;
    i += 1;
  }

  const tail = current.trim();
  // A trailing statement with no semicolon is still a statement — but a tail
  // of nothing but comments is not.
  if (tail && !/^(?:--[^\n]*\n?|\s)*$/.test(tail)) statements.push(tail);
  return statements;
}

export function checksum(sql: string): string {
  // Line endings are normalised so a file that round-trips through a Windows
  // editor does not read as edited.
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
}

export function loadMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    // Lexicographic order, which is why files are zero-padded: `0010` must
    // sort after `0009`, and `10_` does not.
    .sort()
    .map((name) => {
      const sql = readFileSync(join(dir, name), "utf8");
      return { name, sql, checksum: checksum(sql) };
    });
}

async function main() {
  const dryRun = process.argv.includes("--dry");
  // `||`, not `??`. GitHub Actions sets an env var to the EMPTY STRING when
  // the secret behind it does not exist, and `??` only falls back on
  // null/undefined — so `DATABASE_URL_UNPOOLED ?? DATABASE_URL` resolved to ""
  // and refused to migrate while DATABASE_URL was sitting right there,
  // populated. That is exactly what happened on the first CD run after #123.
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL_UNPOOLED (preferred) or DATABASE_URL must be set.\n" +
        "Migrations need the direct connection: the pooler does not carry DDL " +
        "or advisory locks reliably.",
    );
    process.exit(2);
  }

  if (!process.env.DATABASE_URL_UNPOOLED) {
    // Falling back to the pooled string works for a small forward migration,
    // but the pooler can drop an advisory lock, so two concurrent deploys
    // could both decide to run the same migration. Worth saying out loud
    // rather than silently accepting a weaker guarantee.
    console.log(
      "::warning::DATABASE_URL_UNPOOLED is not set — migrating over the pooled " +
        "connection. Add the direct (unpooled) Neon string as a secret in the " +
        "GitHub 'prod' environment; the pooler does not hold advisory locks " +
        "reliably, so concurrent deploys are not fully serialised.",
    );
  }

  const sql = neon(url);
  const migrations = loadMigrations();
  console.log(`Found ${migrations.length} migration(s) on disk.`);

  await sql`
    CREATE TABLE IF NOT EXISTS _migration (
      name        text PRIMARY KEY,
      checksum    text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `;

  const appliedRows = (await sql`SELECT name, checksum FROM _migration`) as {
    name: string;
    checksum: string;
  }[];
  const applied = new Map(appliedRows.map((r) => [r.name, r.checksum]));

  // Drift check before anything runs, so a bad state is reported rather than
  // half-corrected.
  let drift = false;
  for (const migration of migrations) {
    const seen = applied.get(migration.name);
    if (seen && seen !== migration.checksum) {
      console.error(
        `::error::${migration.name} has already been applied but its contents have changed.\n` +
          "  Applied migrations are immutable. Add a new migration that alters " +
          "the schema forward instead — editing this one leaves every " +
          "environment that already ran it silently different.",
      );
      drift = true;
    }
  }
  if (drift) process.exit(1);

  const pending = migrations.filter((m) => !applied.has(m.name));
  if (pending.length === 0) {
    console.log("Nothing to apply — the database is up to date.");
    return;
  }

  console.log(`Pending: ${pending.map((m) => m.name).join(", ")}`);
  if (dryRun) {
    console.log("Dry run — nothing was applied.");
    return;
  }

  await sql`SELECT pg_advisory_lock(${LOCK_ID})`;
  try {
    for (const migration of pending) {
      const statements = splitStatements(migration.sql);
      console.log(`Applying ${migration.name} (${statements.length} statement(s))…`);
      // `transaction` is Neon's batch API; every statement succeeds or none of
      // them do. Each has to be its own query — Neon sends them as prepared
      // statements, and Postgres allows only one command per prepared
      // statement.
      await sql.transaction(statements.map((statement) => sql.query(statement)));
      await sql`
        INSERT INTO _migration (name, checksum)
        VALUES (${migration.name}, ${migration.checksum})
      `;
      console.log(`  ${migration.name} applied.`);
    }
    console.log(`\nApplied ${pending.length} migration(s).`);
  } finally {
    await sql`SELECT pg_advisory_unlock(${LOCK_ID})`;
  }
}

if (require.main === module) {
  void main().catch((err) => {
    console.error("::error::Migration failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
