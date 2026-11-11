import type pg from "pg";
import { once, safeName } from "./db";
import { logger } from "./logger";

/**
 * Counters behind the rate limit and the daily budget. In memory they belong
 * to one process and vanish when it restarts; in Postgres they are shared by
 * every instance and survive deploys, so a restart no longer hands every
 * client a fresh allowance.
 */
export interface UsageStore {
  /** Count one more event for `key` in the current window; returns the new total. */
  hit(scope: string, key: string, windowMs: number): Promise<number>;
  /** Count one more event only if the total would stay within `max`. */
  reserve(scope: string, key: string, windowMs: number, max: number): Promise<boolean>;
  reset?(): void;
}

const windowStart = (now: number, windowMs: number) => Math.floor(now / windowMs) * windowMs;

/** Above this many counters, ended windows are cleared out. Active ones are never dropped. */
const PRUNE_ABOVE = 20_000;

export class MemoryUsageStore implements UsageStore {
  private counts = new Map<string, { count: number; endsAt: number }>();
  private pruneAbove = PRUNE_ABOVE;

  constructor(private readonly now: () => number = Date.now) {}

  private slot(scope: string, key: string, windowMs: number) {
    const start = windowStart(this.now(), windowMs);
    if (this.counts.size > this.pruneAbove) this.prune();
    return { id: `${scope}|${key}|${start}`, endsAt: start + windowMs };
  }

  private prune() {
    const now = this.now();
    for (const [id, entry] of this.counts) if (entry.endsAt <= now) this.counts.delete(id);
    // If most counters are still live, wait for the map to grow before scanning again.
    this.pruneAbove = Math.max(PRUNE_ABOVE, this.counts.size * 2);
  }

  async hit(scope: string, key: string, windowMs: number) {
    const { id, endsAt } = this.slot(scope, key, windowMs);
    const next = (this.counts.get(id)?.count ?? 0) + 1;
    this.counts.set(id, { count: next, endsAt });
    return next;
  }

  async reserve(scope: string, key: string, windowMs: number, max: number) {
    const { id, endsAt } = this.slot(scope, key, windowMs);
    const current = this.counts.get(id)?.count ?? 0;
    if (current >= max) return false;
    this.counts.set(id, { count: current + 1, endsAt });
    return true;
  }

  /** Raise a counter to at least `count`, so a fallback starts from what the shared store said. */
  raise(scope: string, key: string, windowMs: number, count: number) {
    const { id, endsAt } = this.slot(scope, key, windowMs);
    if ((this.counts.get(id)?.count ?? 0) < count) this.counts.set(id, { count, endsAt });
  }

  /** Number of counters held. */
  size() {
    return this.counts.size;
  }

  reset() {
    this.counts.clear();
    this.pruneAbove = PRUNE_ABOVE;
  }
}

export class PostgresUsageStore implements UsageStore {
  private readonly table: string;
  private readonly ensure: () => Promise<void>;

  constructor(private readonly pool: pg.Pool, table = "usage_counters", private readonly now: () => number = Date.now) {
    this.table = safeName(table);
    this.ensure = once(() =>
      pool.query(
        `CREATE TABLE IF NOT EXISTS ${this.table} (
           scope text NOT NULL,
           key text NOT NULL,
           window_start timestamptz NOT NULL,
           count integer NOT NULL,
           PRIMARY KEY (scope, key, window_start)
         )`,
      ),
    );
  }

  private start(windowMs: number) {
    return new Date(windowStart(this.now(), windowMs)).toISOString();
  }

  /** Old windows are of no use; clear them now and then instead of on a schedule. */
  private tidy() {
    if (Math.random() > 0.01) return;
    this.pool
      .query(`DELETE FROM ${this.table} WHERE window_start < now() - interval '3 days'`)
      .catch((err) => logger.warn({ err }, "could not clear old usage counters"));
  }

  async hit(scope: string, key: string, windowMs: number) {
    await this.ensure();
    this.tidy();
    // One statement, so two instances counting at once cannot lose an update.
    const { rows } = await this.pool.query<{ count: number }>(
      `INSERT INTO ${this.table} (scope, key, window_start, count) VALUES ($1, $2, $3, 1)
       ON CONFLICT (scope, key, window_start) DO UPDATE SET count = ${this.table}.count + 1
       RETURNING count`,
      [scope, key, this.start(windowMs)],
    );
    return rows[0]!.count;
  }

  async reserve(scope: string, key: string, windowMs: number, max: number) {
    await this.ensure();
    // The WHERE makes the increment conditional: no row comes back once the total is at max.
    const { rows } = await this.pool.query(
      `INSERT INTO ${this.table} (scope, key, window_start, count) VALUES ($1, $2, $3, 1)
       ON CONFLICT (scope, key, window_start) DO UPDATE SET count = ${this.table}.count + 1
       WHERE ${this.table}.count < $4
       RETURNING count`,
      [scope, key, this.start(windowMs), max],
    );
    return max > 0 && rows.length > 0;
  }
}

/**
 * Shared counters with a local stand-in. If the database cannot be reached the
 * limits still hold for this process, which is safer than either refusing
 * every request or enforcing nothing. The stand-in follows every answer the
 * shared store gives, so an outage continues from the counts seen so far
 * instead of handing out a fresh allowance.
 */
export class ResilientUsageStore implements UsageStore {
  private readonly local = new MemoryUsageStore();

  constructor(private readonly shared: UsageStore | null) {}

  async hit(scope: string, key: string, windowMs: number) {
    if (!this.shared) return this.local.hit(scope, key, windowMs);
    try {
      const total = await this.shared.hit(scope, key, windowMs);
      this.local.raise(scope, key, windowMs, total);
      return total;
    } catch (err) {
      logger.warn({ err }, "shared usage counters unavailable; counting in this process");
      return this.local.hit(scope, key, windowMs);
    }
  }

  async reserve(scope: string, key: string, windowMs: number, max: number) {
    if (!this.shared) return this.local.reserve(scope, key, windowMs, max);
    try {
      const granted = await this.shared.reserve(scope, key, windowMs, max);
      // Granted: this process has used one more. Refused: the allowance is spent.
      if (granted) await this.local.hit(scope, key, windowMs);
      else this.local.raise(scope, key, windowMs, max);
      return granted;
    } catch (err) {
      logger.warn({ err }, "shared usage counters unavailable; counting in this process");
      return this.local.reserve(scope, key, windowMs, max);
    }
  }

  reset() {
    this.local.reset();
    this.shared?.reset?.();
  }
}
