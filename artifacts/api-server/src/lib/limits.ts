import crypto from "node:crypto";
import { AppError } from "./errors";
import { MemoryUsageStore, type UsageStore } from "./usage-store";

type Clock = () => number;

/**
 * Fixed-window request counter per client. The counts live in a UsageStore:
 * in memory for one process, or in the database, where every instance shares
 * them and a restart does not reset them.
 */
export class RateLimiter {
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly store: UsageStore = new MemoryUsageStore(),
    private readonly now: Clock = Date.now,
    /** Mixed into the stored key so the table never holds a readable address. */
    private readonly salt = "",
  ) {}

  /** Throws RATE_LIMITED once a client exceeds `max` requests in the window. */
  async take(client: string) {
    const key = crypto.createHash("sha256").update(this.salt).update(client).digest("hex").slice(0, 32);
    const count = await this.store.hit("rate", key, this.windowMs);
    if (count > this.max) {
      const elapsed = this.now() % this.windowMs;
      throw new AppError(429, "RATE_LIMITED", "Too many requests. Please wait a few minutes and try again.", {
        retryAfterSec: Math.max(1, Math.ceil((this.windowMs - elapsed) / 1000)),
      });
    }
  }
}

export const DAY_MS = 86_400_000;

const busy = () =>
  new AppError(503, "OVERLOADED", "Vantage is busy generating other briefs. Please try again in a moment.", { retryAfterSec: 20, refused: "busy" });
const spent = (message: string) => new AppError(503, "OVERLOADED", message, { retryAfterSec: 3600, refused: "budget" });

/**
 * Bounds what the public can make the service spend: how many briefs may be
 * generating at once in this process, and how many may be generated per UTC
 * day across every instance.
 */
export class GenerationGate {
  private active = 0;

  constructor(
    private readonly maxConcurrent: number,
    private readonly dailyBudget: number,
    private readonly store: UsageStore = new MemoryUsageStore(),
  ) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    return this.admit(this.maxConcurrent, null, work);
  }

  /**
   * Work nobody is waiting for (warming the home page's briefs). It may only
   * start while at least one slot stays free for readers, and `allowance` is
   * charged before the daily budget, so background work has its own cap
   * within it. Refusals carry `refused: "busy"` or `"budget"`.
   */
  async runBackground<T>(allowance: () => Promise<boolean>, work: () => Promise<T>): Promise<T> {
    return this.admit(this.maxConcurrent - 1, allowance, work);
  }

  private async admit<T>(limit: number, allowance: (() => Promise<boolean>) | null, work: () => Promise<T>): Promise<T> {
    if (this.active >= limit) throw busy();
    // Hold the slot before the first await, so two requests cannot both take the last one.
    this.active += 1;
    try {
      if (allowance && !(await allowance())) throw spent("Background generation has reached its limit for today.");
      if (!(await this.store.reserve("budget", "briefs", DAY_MS, this.dailyBudget))) {
        throw spent("Vantage has reached today's limit for new briefs. Previously generated briefs still load.");
      }
      return await work();
    } finally {
      this.active -= 1;
    }
  }

  /** Generations running in this process now. */
  get running() {
    return this.active;
  }

  reset() {
    this.active = 0;
  }
}
