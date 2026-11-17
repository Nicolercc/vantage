import { briefFor, readyBrief, resolveTopic } from "./brief-for";
import { latestHeadlines, type HeadlinePull } from "./retrieval/headlines";
import { rankTrending, TRENDING_WINDOW_MS, type TrendingCluster } from "./trending";
import type { BriefState } from "../lib/brief-state";
import type { Config } from "../lib/config";
import { AppError } from "../lib/errors";
import { DAY_MS } from "../lib/limits";
import { logger } from "../lib/logger";

export type TrendingSnapshot = { updatedAt: string; outletCount: number; topics: TrendingCluster[] };

type Deps = { pull: () => Promise<HeadlinePull>; now: () => number };

/**
 * Keeps the home page's "Today" topics: a ranking of recent headlines,
 * refreshed on a schedule, and briefs on the top few made in advance so a
 * reader who picks one does not wait.
 *
 * Spending rules. Warming goes through the same gate, daily budget and cost
 * ledger as a reader's brief, never takes the last free slot, and has its own
 * daily cap (`dailyMax`). Without a database that cap and the budget live in
 * this process and start again after a restart, so the first refresh after
 * start-up only ranks: a host that restarts or wakes often cannot multiply
 * what warming spends.
 */
export class TrendingService {
  private snapshot: TrendingSnapshot | null = null;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private refreshes = 0;
  private stopped = false;

  constructor(
    private readonly state: BriefState,
    private readonly settings: Config["trending"],
    private readonly deps: Deps = { pull: () => latestHeadlines(), now: Date.now },
  ) {}

  /** Rank now, then on every interval. Does nothing when switched off or already started. */
  start() {
    if (!this.settings.enabled || this.timer) return;
    this.stopped = false;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.settings.intervalMs);
    this.timer.unref?.();
  }

  /** Stop scheduling, and start no further warm-ups. A brief already being written finishes. */
  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One refresh at a time; a call while one runs waits for that one. Never rejects. */
  refresh(): Promise<void> {
    this.running ??= this.refreshOnce()
      .catch((err) => logger.warn({ err }, "trending refresh failed; keeping the previous topics"))
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  /**
   * The latest ranking, or null when there is none recent enough to call
   * "today". Asking for it when it is older than one interval starts a refresh:
   * a host that slept through its schedule catches up on the next visit.
   */
  current(): TrendingSnapshot | null {
    if (!this.settings.enabled) return null;
    const age = this.snapshot ? this.deps.now() - Date.parse(this.snapshot.updatedAt) : Infinity;
    if (age > this.settings.intervalMs && !this.running && !this.stopped) void this.refresh();
    return age <= this.maxAgeMs ? this.snapshot : null;
  }

  /** How old a ranking may be and still be shown: three hours, or two missed refreshes if longer. */
  get maxAgeMs() {
    return Math.max(3 * 3_600_000, 2 * this.settings.intervalMs);
  }

  reset() {
    this.stop();
    this.snapshot = null;
    this.running = null;
    this.refreshes = 0;
    this.stopped = false;
  }

  private async refreshOnce() {
    const { headlines, providers } = await this.deps.pull();
    const answered = providers.filter((p) => p.status !== "failed").length;
    // A pull where most sources failed would replace a fair picture with a lopsided one.
    if (answered < providers.length / 2) {
      logger.warn({ answered, of: providers.length }, "trending: most sources failed; keeping the previous topics");
      return;
    }
    const now = this.deps.now();
    const { clusters, outletCount } = rankTrending(headlines, { now, windowMs: TRENDING_WINDOW_MS });
    this.snapshot = { updatedAt: new Date(now).toISOString(), outletCount, topics: clusters };
    this.refreshes += 1;
    logger.info({ topics: clusters.map((c) => `${c.label} (${c.outletCount})`), outletCount, answered }, "trending topics ranked");
    if (this.refreshes > 1) await this.warm(clusters);
  }

  /** Brief the top topics that have no ready brief, one at a time. */
  private async warm(clusters: TrendingCluster[]) {
    const { dailyMax } = this.settings;
    const allowance = () => this.state.usage.reserve("budget", "trending", DAY_MS, dailyMax);
    for (const topic of clusters.slice(0, this.settings.pregenerate)) {
      if (this.stopped) return;
      if (await readyBrief(this.state, topic.label)) continue;
      try {
        await briefFor(this.state, resolveTopic(topic.label), { background: { allowance } });
        logger.info({ topic: topic.label }, "trending brief ready");
      } catch (err) {
        const refused = err instanceof AppError ? err.options.refused : undefined;
        // Out of allowance: nothing more today. Busy: readers come first; try at the next refresh.
        if (refused) {
          logger.info({ topic: topic.label, refused }, "trending warm-up stopped");
          return;
        }
        // One topic failing (no sources, a model error) does not hold up the rest.
        logger.warn({ err, topic: topic.label }, "trending brief failed");
      }
    }
  }
}
