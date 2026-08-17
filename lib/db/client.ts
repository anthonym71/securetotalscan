// ──────────────────────────────────────────────────────────────
// Database client — Neon Postgres.
//
// The first runtime dependency this project has ever had. Until now
// `package.json` listed exactly `next`, `react` and `react-dom`, so this line
// is a supply-chain decision as much as a technical one:
// `@neondatabase/serverless` is Neon's own driver, speaks their HTTP endpoint,
// and needs no TCP connection pool — which matters because a serverless
// function that opens a Postgres connection per invocation exhausts the pool
// under exactly the traffic you want.
//
// Nothing calls this yet. PR 2.1 lands the schema and the client; PR 2.2 is
// the first writer.
// ──────────────────────────────────────────────────────────────

import { neon } from "@neondatabase/serverless";

export class DatabaseUnavailableError extends Error {}

let cached: ReturnType<typeof neon> | null = null;

/** True when a connection string is configured. */
export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * The query function, created once per process.
 *
 * Throws rather than returning null when unconfigured. A caller that gets a
 * null client tends to carry on and silently skip the write — which is how a
 * feature ships looking like it works while persisting nothing.
 */
export function db() {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new DatabaseUnavailableError(
        "DATABASE_URL is not set. It is a secret in the GitHub `prod` environment and is synced to Vercel by scripts/sync-vercel-env.sh.",
      );
    }
    cached = neon(url);
  }
  return cached;
}

/** Test seam — drops the cached client so a changed URL is picked up. */
export function __resetDbClient(): void {
  cached = null;
}

/**
 * The connection string migrations must use.
 *
 * Neon issues two: a pooled one for queries and a direct one for everything
 * the pooler cannot carry — which includes DDL and advisory locks, both of
 * which a migration needs. Running migrations through the pooler appears to
 * work until two of them race.
 */
export function migrationUrl(): string {
  // `||`, not `??` — see scripts/migrate.ts. An env var whose secret does not
  // exist arrives as the empty string, which `??` treats as a real value.
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    throw new DatabaseUnavailableError(
      "Neither DATABASE_URL_UNPOOLED nor DATABASE_URL is set; cannot migrate.",
    );
  }
  return url;
}
