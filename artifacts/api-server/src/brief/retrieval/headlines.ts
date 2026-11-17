import { NEVER } from "../abort";
import type { Headline } from "../trending";
import { searchHeadlines } from "./news-search";
import { FEEDS, latestFeedItems } from "./rss";

/**
 * Broad searches for outlets beyond the fixed feeds. Each is one request per
 * refresh; the results are counted only if a headline names a place and
 * carries a conflict word, like everything else.
 */
export const DISCOVERY_QUERIES = ["war", "ceasefire", "airstrike", "humanitarian crisis", "rebels attack", "military coup"];

export type HeadlinePull = {
  headlines: Headline[];
  providers: Array<{ provider: string; status: "ok" | "empty" | "failed" }>;
};

/** Every recent headline from every publisher feed and the broad searches, at once. */
export async function latestHeadlines(signal: AbortSignal = NEVER): Promise<HeadlinePull> {
  const [feeds, searches] = await Promise.all([
    Promise.all(FEEDS.map(async (feed) => ({ feed, result: await latestFeedItems(feed, signal) }))),
    Promise.all(DISCOVERY_QUERIES.map((q) => searchHeadlines(q, signal))),
  ]);
  const headlines: Headline[] = [];
  for (const { feed, result } of feeds) {
    for (const c of result.candidates) {
      if (c.url) headlines.push({ title: c.title, publisher: c.publisher, url: c.url, publishedAt: c.publishedAt, outletCountry: feed.country });
    }
  }
  for (const result of searches) {
    for (const c of result.candidates) {
      if (c.url) headlines.push({ title: c.title, publisher: c.publisher, url: c.url, publishedAt: c.publishedAt, outletCountry: null });
    }
  }
  const providers = [
    ...feeds.map(({ result }) => ({ provider: result.provider, status: result.status })),
    ...searches.map((r, i) => ({ provider: `${r.provider} ("${DISCOVERY_QUERIES[i]}")`, status: r.status })),
  ];
  return { headlines, providers };
}
