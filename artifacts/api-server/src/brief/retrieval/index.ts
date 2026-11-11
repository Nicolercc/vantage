import { selectNews, toRecords, type Candidate, type ProviderResult, type SourceRecord } from "../sources";
import { NEVER } from "../abort";
import { NEWS_SEARCH_TIMEOUT_MS, searchNews } from "./news-search";
import { FEED_TIMEOUT_MS, FEEDS, searchFeed } from "./rss";
import { searchWikipedia, WIKIPEDIA_MAX_MS } from "./wikipedia";

/** Longest retrieval can take: providers run at once, each within its own deadline. */
export const RETRIEVAL_MAX_MS = Math.max(NEWS_SEARCH_TIMEOUT_MS, FEED_TIMEOUT_MS, WIKIPEDIA_MAX_MS);

export type Coverage = {
  sources: SourceRecord[];
  retrieval: Array<{ provider: string; status: ProviderResult["status"]; count: number }>;
};

/**
 * Query every provider at once. A slow or failed provider never blocks or
 * hides the others; each one's outcome is reported.
 */
export async function searchCoverage(topic: string, supplied?: Candidate, signal: AbortSignal = NEVER): Promise<Coverage> {
  const [search, wiki, ...feeds] = await Promise.all([
    searchNews(topic, signal),
    searchWikipedia(topic, signal),
    ...FEEDS.map((feed) => searchFeed(feed, topic, signal)),
  ]);

  // Feeds first: their outlet and country are known, which the comparison relies on.
  const news = selectNews([...feeds.flatMap((f) => f.candidates), ...search.candidates]);
  const ordered = [...(supplied ? [supplied] : []), ...news, ...wiki.candidates];
  const sources = toRecords(ordered);

  const selectedByProvider = (provider: string) => sources.filter((s) => s.provider === provider).length;
  const retrieval = [search, ...feeds, wiki].map((r) => ({
    provider: r.provider,
    status: r.status,
    count: selectedByProvider(r.provider),
  }));

  return { sources, retrieval };
}
