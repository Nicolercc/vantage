import pg from "pg";
import { logger } from "./logger";

/**
 * One connection pool for everything the server keeps in Postgres.
 *
 * Every statement has a deadline enforced by the server, which cancels it:
 * a database that accepts connections but stalls (a held lock, an overloaded
 * host) fails the query quickly, so the callers' fallbacks run instead of
 * requests piling up on the five shared connections. The client-side timeout
 * is a backstop for a server that stops answering altogether.
 */
export function createPool(
  connectionString: string,
  { statementTimeoutMs = 5_000, lockTimeoutMs = 2_000 }: { statementTimeoutMs?: number; lockTimeoutMs?: number } = {},
): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: statementTimeoutMs,
    lock_timeout: lockTimeoutMs,
    query_timeout: statementTimeoutMs + 1_000,
    // Hosted Postgres requires TLS; a local server does not offer it.
    ssl: /localhost|127\.0\.0\.1|sslmode=disable/.test(connectionString) ? undefined : { rejectUnauthorized: true },
  });
  // An idle connection dropped by the server must not crash the process.
  pool.on("error", (err) => logger.warn({ err }, "database connection error"));
  return pool;
}

/**
 * Runs a table's CREATE statements once, on first use, and again after a
 * failure — so the server can start before the database is reachable.
 */
export function once(setup: () => Promise<unknown>): () => Promise<void> {
  let ready: Promise<void> | null = null;
  return () => {
    ready ??= setup().then(
      () => undefined,
      (err) => {
        ready = null;
        throw err;
      },
    );
    return ready;
  };
}

export const safeName = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error("invalid table name");
  return name;
};
