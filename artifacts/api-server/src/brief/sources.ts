/**
 * Evidence records. A SourceRecord is created by retrieval (or from what the
 * reader supplied) and is the only place a URL, publisher or date can come
 * from. `text` is what claims are checked against; it stays on the server.
 */
export type SourceKind = "news" | "reference" | "article";

export type SourceRecord = {
  id: string;
  kind: SourceKind;
  provider: string;
  publisher: string;
  title: string;
  url: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  language: string | null;
  country: string | null;
  excerpt: string | null;
  /** Server-only: the full text available for support checks and the prompt. */
  text: string;
};

/** A record before it has been selected and given an id. */
export type Candidate = Omit<SourceRecord, "id" | "retrievedAt" | "text"> & {
  text?: string;
  /** How much of the topic the headline names, 0 to 1. Fuller matches are selected first. */
  relevance?: number;
};

export type ProviderResult = {
  provider: string;
  status: "ok" | "empty" | "failed";
  candidates: Candidate[];
};

const TRACKING_PARAM = /^(utm_|at_|traffic_source$|fbclid$|gclid$|ref$|cmp$)/i;

/** Same article, different tracking parameters or trailing slash. */
export function canonicalUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) u.searchParams.delete(key);
    }
    u.hostname = u.hostname.replace(/^www\./, "");
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

const titleKey = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export const cleanText = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;|&gt;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Shorten at a word boundary and mark the cut. */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).replace(/[\s,;:.]+$/, "")}…`;
}

/**
 * Deduplicate, keep any one outlet from crowding out the rest, and spread the
 * selection across countries so the comparison has something to compare.
 */
export function selectNews(candidates: Candidate[], limit = 12, perPublisher = 2): Candidate[] {
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const perOutlet = new Map<string, number>();
  const unique: Candidate[] = [];
  // Full matches before partial ones; a stable sort keeps each group's original order.
  const ranked = [...candidates].sort((a, b) => (b.relevance ?? 1) - (a.relevance ?? 1));
  for (const c of ranked) {
    const url = c.url ? canonicalUrl(c.url) : null;
    if (!url || !c.title.trim()) continue;
    const tKey = titleKey(c.title);
    // Wire copy is republished under many mastheads; one headline counts once.
    if (seenUrl.has(url) || seenTitle.has(tKey)) continue;
    const outlet = c.publisher.toLowerCase();
    if ((perOutlet.get(outlet) ?? 0) >= perPublisher) continue;
    seenUrl.add(url);
    seenTitle.add(tKey);
    perOutlet.set(outlet, (perOutlet.get(outlet) ?? 0) + 1);
    unique.push({ ...c, url });
  }

  // Round-robin by country, preserving each country's original (recency) order.
  const byCountry = new Map<string, Candidate[]>();
  for (const c of unique) {
    const key = c.country ?? "unknown";
    byCountry.set(key, [...(byCountry.get(key) ?? []), c]);
  }
  const picked: Candidate[] = [];
  while (picked.length < limit) {
    let took = false;
    for (const queue of byCountry.values()) {
      const next = queue.shift();
      if (!next) continue;
      picked.push(next);
      took = true;
      if (picked.length >= limit) break;
    }
    if (!took) break;
  }
  return picked;
}

/** Give selected records their ids and server timestamps. */
export function toRecords(candidates: Candidate[], now = new Date()): SourceRecord[] {
  const retrievedAt = now.toISOString();
  return candidates.map(({ relevance: _relevance, ...c }, i) => ({
    ...c,
    id: `S${i + 1}`,
    retrievedAt,
    text: cleanText(`${c.title}. ${c.text ?? c.excerpt ?? ""}`),
  }));
}

/** What the client receives: everything except the server-only text. */
export function toPublicSource({ text: _text, ...rest }: SourceRecord) {
  return rest;
}

const GENERIC = new Set([
  "the", "and", "for", "with", "from", "into", "over", "amid", "about",
  "news", "latest", "update", "updates", "reporting", "report", "reports",
  "analysis", "situation", "coverage",
]);

/** Abbreviations short enough to fall under the three-letter minimum that still name a topic. */
const SHORT_TERMS = new Set<string>(["us", "uk", "eu", "un", "ai"]);

/** Search terms from a reader's topic: lowercased words of 3+ letters (or a known abbreviation) minus filler. */
export function topicTerms(topic: string): string[] {
  const words: string[] = topic.toLowerCase().replace(/\bu\.s\.(a\.)?/g, "us ").match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words.filter((w) => (w.length >= 3 || SHORT_TERMS.has(w)) && !GENERIC.has(w)))].slice(0, 8);
}

/**
 * Words that describe conflicts in general. They help a search engine but
 * cannot decide whether a headline is about the reader's topic: "humanitarian
 * access" appears in stories about every crisis.
 */
export const CONFLICT_VOCABULARY = new Set([
  "war", "wars", "conflict", "conflicts", "crisis", "crises", "tension", "tensions", "ceasefire",
  "truce", "peace", "talks", "negotiation", "negotiations", "humanitarian", "access", "aid",
  "attack", "attacks", "strike", "strikes", "airstrike", "airstrikes", "offensive", "front",
  "line", "frontline", "military", "army", "forces", "troops", "civil", "civilian", "civilians",
  "refugee", "refugees", "displacement", "shipping", "sanctions", "border", "invasion", "siege",
  "fighting", "violence", "protest", "protests", "coup", "election", "elections", "deal",
]);

/**
 * Places whose name contains another place's name. "South Sudan" is not
 * "Sudan": unless the reader asked for the longer name, it is removed from a
 * headline before matching so it cannot stand in for the shorter one.
 */
const COMPOUND_PLACES = [
  "south sudan", "south africa", "central african republic", "north korea", "south korea",
  "northern ireland", "new guinea", "equatorial guinea", "guinea bissau", "new mexico",
  "new zealand", "western sahara", "west bank", "east timor", "south ossetia", "north macedonia",
  "dominican republic", "new caledonia", "south china sea", "east china sea", "red sea",
  "black sea", "nagorno karabakh", "democratic republic of congo", "dr congo", "congo brazzaville",
];

/** Digests list several unrelated stories under one headline; none of them is the subject. */
export const ROUNDUP = /\b(news in brief|in brief:|round-?up|daily digest|weekly digest|newsletter|top stories|week in review|this week in|what to know today)/i;

export const normalise = (s: string) =>
  ` ${(s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).join(" ").replace(/'s\b/g, "")} `;

/**
 * Abbreviations headlines write in capitals. A headline's "US" is the country
 * and its "us" a pronoun, so headlines are matched case-sensitively; a
 * reader's topic is not ("us airlines" means the country).
 */
const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bU\.?S\.?A?\b\.?/g, " unitedstates "],
  [/\bU\.?K\.?\b/g, " unitedkingdom "],
  [/\bE\.?U\.?\b/g, " europeanunion "],
  [/\bU\.?N\.?\b/g, " unitednations "],
  [/\bA\.?I\.?\b/g, " artificialintelligence "],
];

/** Names written several ways, made one word so any spelling matches. Applied to normalised text. */
const PHRASES: Array<[RegExp, string]> = [
  [/ united states(?: of america)? | (?<!(?:south|latin|north|central) )america /g, " unitedstates "],
  [/ united kingdom | (?:great )?britain /g, " unitedkingdom "],
  [/ european union /g, " europeanunion "],
  [/ united nations /g, " unitednations "],
  [/ artificial intelligence /g, " artificialintelligence "],
];

/** Words headlines use for each other, mapped to one of them. */
const SYNONYMS: Record<string, string> = {
  carrier: "airline",
  carriers: "airline",
  blackout: "outage",
  glitch: "outage",
};

/**
 * Compound place names written as one word ("south sudan" becomes
 * "southsudan"), so a topic that names one needs that place, not its two
 * words apart. The Congo's long names are left as words: headlines shorten
 * them to "Congo".
 */
const JOINED_PLACES = COMPOUND_PLACES.filter((p) => !p.includes("congo")).map((p) => [` ${p} `, ` ${p.replace(/ /g, "")} `] as const);

/** Normalised text with abbreviations, alternative names and compound places reduced to one spelling. */
function canonical(text: string, anyCase: boolean): string {
  let s = text;
  for (const [pattern, word] of ABBREVIATIONS) {
    s = s.replace(anyCase ? new RegExp(pattern.source, "gi") : pattern, word);
  }
  s = normalise(s);
  // Each pattern consumes its surrounding spaces; run twice so neighbours both match.
  for (const [pattern, word] of PHRASES) s = s.replace(pattern, word).replace(pattern, word);
  for (const [place, joined] of JOINED_PLACES) s = s.replaceAll(place, joined).replaceAll(place, joined);
  return s;
}

/**
 * Light stemming, the same on both sides of a match, for words of five
 * letters or more: plurals, -ing and -ed, then a final e, so "airlines" meets
 * "airline" and "grounded" meets "ground". Short words are left alone ("red"
 * is not "r").
 */
export function stem(word: string): string {
  let w = SYNONYMS[word] ?? word;
  if (w.length < 5) return w;
  if (w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (/(ss|x|ch|sh)es$/.test(w)) w = w.slice(0, -2);
  else if (w.endsWith("s") && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  if (w.length > 4 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

/**
 * The words a headline has to name. The topic's distinctive words (usually
 * place, actor or subject names) count; words for conflict in general do not,
 * judged before stemming. A topic with no distinctive word counts all of them.
 */
function topicAnchors(topic: string): string[] {
  const words = [...new Set(canonical(topic, true).trim().split(" "))]
    .filter((w) => (w.length >= 3 || SHORT_TERMS.has(w)) && !GENERIC.has(w))
    .slice(0, 8);
  const anchors = words.filter((w) => !CONFLICT_VOCABULARY.has(w));
  return [...new Set((anchors.length > 0 ? anchors.slice(0, 4) : words).map(stem))];
}

/**
 * How much of the topic a headline names, from 0 to 1. Whole words only ("red"
 * must not match "secured"). A longer place name that merely contains the
 * topic's ("South Sudan" for "Sudan") does not count, and neither does a
 * mention in a multi-story digest.
 */
export function topicScorer(topic: string): (text: string) => number {
  const required = topicAnchors(topic);
  if (required.length === 0) return () => 0;
  const topicText = normalise(topic);
  const otherPlaces = COMPOUND_PLACES.filter((p) => !topicText.includes(` ${p} `));
  // A compound name the reader asked for must be there whatever else matches.
  const askedPlaces = JOINED_PLACES.filter(([place]) => topicText.includes(place)).map(([, joined]) => joined);
  return (text) => {
    if (ROUNDUP.test(text)) return 0;
    let haystack = canonical(text, false);
    if (!askedPlaces.every((p) => haystack.includes(p))) return 0;
    for (const place of otherPlaces) {
      haystack = haystack
        .replace(new RegExp(`(?<= )${place.replace(/ /g, "")}(?= )`, "g"), "|")
        .replace(new RegExp(`(?<= )${place}(?= )`, "g"), "|");
    }
    const present = new Set(haystack.split(" ").map(stem));
    return required.filter((t) => present.has(t)).length / required.length;
  };
}

/**
 * The share of a topic's distinctive words a headline must name. One or two
 * must all be there, so a place-name topic ("Sudan", "Lebanon Israel border")
 * matches exactly as before. From three up, most will do, and fuller matches
 * are selected first.
 */
export function enoughOfTopic(topic: string): number {
  const n = topicAnchors(topic).length;
  return n <= 2 ? 1 : Math.ceil(0.6 * n) / n;
}

/** Whether a headline is about the topic: it names enough of the topic's distinctive words. */
export function topicMatcher(topic: string): (text: string) => boolean {
  const score = topicScorer(topic);
  const needed = enoughOfTopic(topic);
  return (text) => {
    const s = score(text);
    return s > 0 && s >= needed - 1e-9;
  };
}

/**
 * How relevant a headline is, 0 when it should be left out: scored against a
 * reader's topic, or passed through a caller's own filter (kept as fully
 * relevant), as the trending discovery does to keep every item.
 */
export function headlineRelevance(topic: string | ((title: string) => boolean)): (title: string) => number {
  if (typeof topic !== "string") return (title) => (topic(title) ? 1 : 0);
  const score = topicScorer(topic);
  const needed = enoughOfTopic(topic) - 1e-9;
  return (title) => {
    const s = score(title);
    return s >= needed ? s : 0;
  };
}
