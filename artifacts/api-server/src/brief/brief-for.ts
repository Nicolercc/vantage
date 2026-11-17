import { buildBrief, type BriefInput } from "./generate";
import { upgradeStoredBrief } from "./upgrade";
import type { BriefState } from "../lib/brief-state";
import type { StoredBrief } from "../lib/brief-store";
import { invalidInput } from "../lib/errors";

export type Resolved = { key: string; input: BriefInput };

/**
 * A reader's topic as the cache and store know it. Every path that asks for a
 * topic brief (the routes, the home page's warm-up, its "ready" check) goes
 * through here, so they all agree on the key.
 */
export function resolveTopic(raw: string): Resolved {
  const topic = raw.trim().replace(/\s+/g, " ");
  if (topic.length < 3) throw invalidInput("Topic must be at least 3 characters.");
  return { key: `topic:${topic.toLowerCase()}`, input: { topic } };
}

type Options = {
  /**
   * Generate as background work: only with a slot left for readers, charged
   * to `allowance` as well as the daily budget. Only the caller that actually
   * starts generation is charged; one that finds the brief, or joins work
   * already under way, spends nothing.
   */
  background?: { allowance: () => Promise<boolean> };
};

/**
 * A decline saved before Vantage briefed news beyond conflicts, or one the
 * conflict writer gave without knowing the topic's type. Either may be news
 * that can now be briefed, so it is written again rather than served.
 */
const isUntypedDecline = (brief: StoredBrief) => {
  const b = brief as StoredBrief & { inScope?: boolean; topicType?: string };
  return b.inScope === false && b.topicType === undefined;
};

/**
 * Serve a brief from this process's cache or the store; otherwise generate it
 * once, however many requests are waiting, and save it so its link keeps working.
 */
export function briefFor(state: BriefState, { key, input }: Resolved, options: Options = {}): Promise<StoredBrief> {
  const { cache, cacheTtlMs, gate, store, progress } = state;
  return cache.getOrCreate(key, async () => {
    const saved = await store.latest(key, cacheTtlMs);
    if (saved && !isUntypedDecline(saved)) return upgradeStoredBrief(saved);
    const generate = async () => {
      progress.open(key);
      try {
        const brief = await buildBrief(input, (event) => progress.publish(key, event));
        await store.save(key, brief);
        return brief;
      } finally {
        progress.close(key);
      }
    };
    return options.background ? gate.runBackground(options.background.allowance, generate) : gate.run(generate);
  });
}

/** The brief a reader asking for this topic now would be served without waiting, if there is one. */
export async function readyBrief(state: BriefState, topic: string): Promise<StoredBrief | null> {
  const { key } = resolveTopic(topic);
  return state.cache.peek(key) ?? (await state.store.latest(key, state.cacheTtlMs));
}
