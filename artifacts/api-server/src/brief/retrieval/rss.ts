import { NEVER, until } from "../abort";
import { XMLParser } from "fast-xml-parser";
import { cleanText, headlineRelevance, truncate, type Candidate, type ProviderResult } from "../sources";

/** The kind of news a feed carries. World feeds cover conflicts and foreign news; the others widen general news. */
export type Desk = "world" | "business" | "technology" | "science" | "national" | "sport";

export type Feed = { provider: string; publisher: string; country: string | null; url: string; desk: Desk };

const feed = (publisher: string, country: string | null, url: string, section = "", desk: Desk = "world"): Feed => ({
  provider: `${publisher} RSS${section ? ` (${section})` : ""}`,
  publisher,
  country,
  url,
  desk,
});

/**
 * Publisher-owned feeds, chosen for regional spread. Each gives a headline,
 * the publisher's own summary, a link and a date. A feed holds only the
 * outlet's most recent items, so a topic can legitimately match nothing.
 */
export const FEEDS: Feed[] = [
  feed("Al Jazeera", "Qatar", "https://www.aljazeera.com/xml/rss/all.xml"),
  feed("BBC News", "United Kingdom", "https://feeds.bbci.co.uk/news/world/rss.xml", "World"),
  feed("BBC News", "United Kingdom", "https://feeds.bbci.co.uk/news/world/africa/rss.xml", "Africa"),
  feed("BBC News", "United Kingdom", "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml", "Middle East"),
  feed("BBC News", "United Kingdom", "https://feeds.bbci.co.uk/news/world/europe/rss.xml", "Europe"),
  feed("BBC News", "United Kingdom", "https://feeds.bbci.co.uk/news/world/asia/rss.xml", "Asia"),
  feed("The Guardian", "United Kingdom", "https://www.theguardian.com/world/rss"),
  feed("France 24", "France", "https://www.france24.com/en/rss"),
  feed("NPR", "United States", "https://feeds.npr.org/1004/rss.xml"),
  feed("The Hindu", "India", "https://www.thehindu.com/news/international/feeder/default.rss"),
  feed("Times of India", "India", "https://timesofindia.indiatimes.com/rssfeeds/296589292.cms"),
  feed("Dawn", "Pakistan", "https://www.dawn.com/feeds/world"),
  feed("South China Morning Post", "Hong Kong", "https://www.scmp.com/rss/91/feed"),
  feed("Premium Times", "Nigeria", "https://www.premiumtimesng.com/feed"),
  feed("Africanews", null, "https://www.africanews.com/feed/rss"),
  feed("AllAfrica", null, "https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf"),
  feed("teleSUR", "Venezuela", "https://www.telesurenglish.net/feed/"),
  feed("UN News", "United Nations", "https://news.un.org/feed/subscribe/en/news/all/rss.xml"),
  feed("UN News", "United Nations", "https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml", "Peace and security"),
  feed("BBC News", "United Kingdom", "https://feeds.bbci.co.uk/news/world/latin_america/rss.xml", "Latin America"),

  // Desks beyond world news, so a business, technology, science, national or
  // sport story has publisher reporting too. Every brief reads them all (they
  // are cached like the rest); the headline matcher decides what is relevant.
  feed("BBC News", "United Kingdom", "https://feeds.bbci.co.uk/news/business/rss.xml", "Business", "business"),
  feed("The Guardian", "United Kingdom", "https://www.theguardian.com/business/rss", "Business", "business"),
  feed("NPR", "United States", "https://feeds.npr.org/1006/rss.xml", "Business", "business"),
  feed("South China Morning Post", "Hong Kong", "https://www.scmp.com/rss/92/feed", "Business", "business"),
  feed("The Hindu", "India", "https://www.thehindu.com/business/feeder/default.rss", "Business", "business"),
  feed("Dawn", "Pakistan", "https://www.dawn.com/feeds/business", "Business", "business"),
  feed("BBC News", "United Kingdom", "https://feeds.bbci.co.uk/news/technology/rss.xml", "Technology", "technology"),
  feed("The Guardian", "United Kingdom", "https://www.theguardian.com/technology/rss", "Technology", "technology"),
  feed("NPR", "United States", "https://feeds.npr.org/1019/rss.xml", "Technology", "technology"),
  feed("South China Morning Post", "Hong Kong", "https://www.scmp.com/rss/36/feed", "Technology", "technology"),
  feed("The Hindu", "India", "https://www.thehindu.com/sci-tech/technology/feeder/default.rss", "Technology", "technology"),
  feed("BBC News", "United Kingdom", "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", "Science", "science"),
  feed("BBC News", "United Kingdom", "https://feeds.bbci.co.uk/news/health/rss.xml", "Health", "science"),
  feed("NPR", "United States", "https://feeds.npr.org/1128/rss.xml", "Health", "science"),
  feed("The Guardian", "United Kingdom", "https://www.theguardian.com/science/rss", "Science", "science"),
  feed("NPR", "United States", "https://feeds.npr.org/1003/rss.xml", "National", "national"),
  feed("PBS NewsHour", "United States", "https://www.pbs.org/newshour/feeds/rss/headlines", "", "national"),
  feed("The Guardian", "United Kingdom", "https://www.theguardian.com/us-news/rss", "US", "national"),
  feed("BBC News", "United Kingdom", "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml", "US and Canada", "national"),
  feed("BBC News", "United Kingdom", "https://feeds.bbci.co.uk/news/uk/rss.xml", "UK", "national"),
  feed("The Hindu", "India", "https://www.thehindu.com/news/national/feeder/default.rss", "National", "national"),
  feed("BBC Sport", "United Kingdom", "https://feeds.bbci.co.uk/sport/rss.xml", "", "sport"),
  feed("The Guardian", "United Kingdom", "https://www.theguardian.com/football/rss", "Football", "sport"),
];

export const FEED_TIMEOUT_MS = 6_000;
const parser = new XMLParser({ ignoreAttributes: true, processEntities: true });

const text = (v: unknown): string =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : "";

/** Keep only items about `topic`, or those a given filter accepts (discovery keeps every item). */
export function parseFeed(xml: string, feed: Feed, topic: string | ((title: string) => boolean)): Candidate[] {
  // A feed is everything the outlet published lately; keep only items about the topic.
  const relevance = headlineRelevance(topic);
  const doc = parser.parse(xml) as { rss?: { channel?: { item?: unknown } } };
  const raw = doc.rss?.channel?.item;
  const items = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Array<Record<string, unknown>>;

  const out: Candidate[] = [];
  for (const item of items) {
    const title = cleanText(text(item["title"]));
    const excerpt = truncate(cleanText(text(item["description"])), 320);
    const link = text(item["link"]).trim();
    if (!title || !/^https?:\/\//i.test(link)) continue;
    // Headline only: summaries mention places in passing ("…after the Sudan game").
    const score = relevance(title);
    if (score === 0) continue;
    const date = new Date(text(item["pubDate"]));
    out.push({
      kind: "news",
      provider: feed.provider,
      publisher: feed.publisher,
      title,
      url: link,
      publishedAt: Number.isNaN(date.getTime()) ? null : date.toISOString(),
      language: "English",
      country: feed.country,
      excerpt: excerpt || null,
      relevance: score,
    });
  }
  return out;
}

// A feed changes every few minutes at most; refetching it for every brief is wasteful and impolite.
const FEED_TTL_MS = 10 * 60_000;
const feedCache = new Map<string, { at: number; xml: string }>();

export function resetFeedCache() {
  feedCache.clear();
}

async function loadFeed(url: string, signal: AbortSignal): Promise<string | null> {
  const hit = feedCache.get(url);
  if (hit && Date.now() - hit.at < FEED_TTL_MS) return hit.xml;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; VantageBot/1.0)" },
    signal: until(signal, FEED_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const xml = await res.text();
  // An error or consent page is not a feed: do not keep it for ten minutes.
  if (!/<rss[\s>]/i.test(xml)) return null;
  feedCache.set(url, { at: Date.now(), xml });
  return xml;
}

export async function searchFeed(feed: Feed, topic: string, signal: AbortSignal = NEVER): Promise<ProviderResult> {
  try {
    const xml = await loadFeed(feed.url, signal);
    if (xml === null) return { provider: feed.provider, status: "failed", candidates: [] };
    const candidates = parseFeed(xml, feed, topic);
    return { provider: feed.provider, status: candidates.length ? "ok" : "empty", candidates };
  } catch {
    return { provider: feed.provider, status: "failed", candidates: [] };
  }
}

/** Every recent item from one feed, unfiltered, for working out what is most covered. */
export async function latestFeedItems(feed: Feed, signal: AbortSignal = NEVER): Promise<ProviderResult> {
  try {
    const xml = await loadFeed(feed.url, signal);
    if (xml === null) return { provider: feed.provider, status: "failed", candidates: [] };
    const candidates = parseFeed(xml, feed, () => true);
    return { provider: feed.provider, status: candidates.length ? "ok" : "empty", candidates };
  } catch {
    return { provider: feed.provider, status: "failed", candidates: [] };
  }
}
