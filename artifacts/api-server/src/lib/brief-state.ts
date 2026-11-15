import crypto from "node:crypto";
import type pg from "pg";
import { BriefCache } from "./brief-cache";
import { createBriefStore, type StoredBrief } from "./brief-store";
import { loadConfig, type Config } from "./config";
import { createPool } from "./db";
import { MemoryLedger, PostgresLedger, useLedger, type CostLedger } from "./ledger";
import { GenerationGate, RateLimiter } from "./limits";
import { ProgressHub } from "./progress-hub";
import type { BriefProgress } from "../brief/generate";
import { PostgresUsageStore, ResilientUsageStore } from "./usage-store";

/**
 * Everything the server keeps between requests. With a database, briefs, the
 * rate limit, the daily budget and the cost ledger are shared by every
 * instance and survive restarts; without one they live in this process.
 * Lives on app.locals so tests can reset it.
 */
export function createBriefState(config: Config = loadConfig().config) {
  const pool: pg.Pool | null = config.databaseUrl ? createPool(config.databaseUrl) : null;
  const usage = new ResilientUsageStore(pool ? new PostgresUsageStore(pool) : null);
  const ledger: CostLedger = pool ? new PostgresLedger(pool) : new MemoryLedger();
  useLedger(ledger, config.modelPrices);

  const { limits } = config;
  const cache = new BriefCache<StoredBrief>(limits.cacheTtlMs, limits.cacheMaxEntries);
  // Client addresses are stored only as a keyed hash. The key must be the same
  // on every instance, so it is derived from a secret they already share.
  const salt = crypto.createHash("sha256").update("rate-limit").update(process.env["ANTHROPIC_API_KEY"] ?? process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"] ?? "").digest("hex");
  const limiter = new RateLimiter(limits.rateLimitMax, limits.rateLimitWindowMs, usage, Date.now, salt);
  const gate = new GenerationGate(limits.maxConcurrent, limits.dailyBudget, usage);
  const store = createBriefStore(pool);
  // Shared by every request and the home page's warm-up, so a reader who
  // arrives while a brief is being built watches it being built.
  const progress = new ProgressHub<BriefProgress>();
  return {
    config,
    pool,
    cache,
    cacheTtlMs: limits.cacheTtlMs,
    store,
    limiter,
    gate,
    ledger,
    progress,
    usage,
    reset() {
      cache.reset();
      store.reset();
      usage.reset();
      gate.reset();
      ledger.reset?.();
    },
  };
}

export type BriefState = ReturnType<typeof createBriefState>;
