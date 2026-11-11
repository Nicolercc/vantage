import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "./db";

/**
 * A database that accepts connections but cannot finish a statement must not
 * hold requests open: every statement has a server-side deadline, after
 * which it is cancelled and the caller's fallbacks take over.
 */
const url = process.env["TEST_DATABASE_URL"];
describe.skipIf(!url)("postgres deadlines", () => {
  const table = `deadline_${Date.now()}`;
  let pool: pg.Pool;
  beforeAll(async () => {
    pool = createPool(url!, { statementTimeoutMs: 300, lockTimeoutMs: 200 });
    await pool.query(`CREATE TABLE ${table} (n integer)`);
  });
  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS ${table}`);
    await pool.end();
  });

  it("sets a statement and lock deadline by default", async () => {
    const defaults = createPool(url!);
    try {
      const { rows } = await defaults.query("SELECT current_setting('statement_timeout') AS s, current_setting('lock_timeout') AS l");
      expect(rows[0]).toEqual({ s: "5s", l: "2s" });
    } finally {
      await defaults.end();
    }
  });

  it("cancels a statement stuck behind a lock instead of waiting for it", async () => {
    const holder = await pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`);
      const started = Date.now();
      await expect(pool.query(`INSERT INTO ${table} VALUES (1)`)).rejects.toThrow(/timeout/i);
      expect(Date.now() - started).toBeLessThan(2_000);
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
    }
  });

  it("cancels a statement that runs past its deadline", async () => {
    await expect(pool.query("SELECT pg_sleep(5)")).rejects.toThrow(/statement timeout/i);
  });
});
