import { describe, expect, it } from "vitest";
import { enoughOfTopic, selectNews, stem, topicMatcher, topicScorer, topicTerms, type Candidate } from "../sources";
import { parseFeed } from "./rss";

/**
 * Headlines written the way outlets write them, for topics beyond conflicts.
 * Each list says what must be kept and what must not, so a looser matcher
 * cannot quietly let unrelated stories into a brief.
 */
const CASES: Array<{ topic: string; keep: string[]; reject: string[] }> = [
  {
    topic: "usa airlines outage",
    keep: [
      "US airlines ground flights after nationwide IT outage",
      "U.S. carriers resume flights as outage clears",
      "Airlines across the United States hit by booking system outage",
    ],
    reject: [
      "Join us for the outage briefing at noon",
      "US stocks down as investors weigh rate path",
      "Microsoft outage hits Teams users in Europe",
      "Airline food prices rise again",
    ],
  },
  {
    topic: "Federal Reserve interest rates",
    keep: ["Federal Reserve holds interest rates steady", "Federal Reserve signals rate cut as inflation cools"],
    reject: ["Interest in reserve teams grows", "Bank of England cuts rates"],
  },
  {
    topic: "Premier League transfers",
    keep: ["Premier League clubs break January transfer record"],
    reject: ["League of Nations centenary", "Transfer of power ceremony in Accra"],
  },
  {
    topic: "South Sudan floods",
    keep: ["South Sudan floods displace thousands in Jonglei"],
    // Same place, other story; and the place's two words apart.
    reject: ["South Sudan opposition leader detained", "Sudan floods hit Kassala", "Flooding in South Kordofan, Sudan"],
  },
];

describe("topic matching beyond conflicts", () => {
  for (const c of CASES) {
    it(`keeps stories about "${c.topic}" and leaves out the rest`, () => {
      const about = topicMatcher(c.topic);
      for (const h of c.keep) expect(about(h), h).toBe(true);
      for (const h of c.reject) expect(about(h), h).toBe(false);
    });
  }

  it("needs every word of a one- or two-word topic, as before", () => {
    expect(enoughOfTopic("Sudan")).toBe(1);
    expect(enoughOfTopic("Lebanon Israel border")).toBe(1);
    expect(enoughOfTopic("Sudan fighting")).toBe(1);
    expect(topicMatcher("Lebanon Israel border")("Israel strikes southern Lebanon")).toBe(true);
    expect(topicMatcher("Lebanon Israel border")("Israel cabinet meets")).toBe(false);
  });

  it("does not turn conflict words into required words by stemming them", () => {
    // "fighting" is a general conflict word; only "Sudan" is required.
    expect(topicMatcher("Sudan fighting")("Sudan's army retakes key bridge")).toBe(true);
  });

  it("scores a partial match below a full one", () => {
    const score = topicScorer("usa airlines outage");
    expect(score("US airlines ground flights after IT outage")).toBe(1);
    expect(score("US airlines announce new routes")).toBeCloseTo(2 / 3);
  });

  it("stems only longer words, the same way on both sides", () => {
    expect(stem("airlines")).toBe(stem("airline"));
    expect(stem("grounded")).toBe("ground");
    expect(stem("red")).toBe("red");
    expect(stem("gas")).toBe("gas");
  });

  it("keeps short country abbreviations in the search terms", () => {
    expect(topicTerms("US election")).toEqual(["us", "election"]);
    expect(topicTerms("U.S. tariffs")).toEqual(["us", "tariffs"]);
  });
});

const news = (title: string, relevance: number, publisher = title): Candidate => ({
  kind: "news", provider: "x", publisher, title, url: `https://x.example/${encodeURIComponent(title)}`,
  publishedAt: null, language: "English", country: null, excerpt: null, relevance,
});

describe("selection by relevance", () => {
  it("selects full matches before partial ones, whatever order they arrived in", () => {
    const picked = selectNews([news("partial", 2 / 3), news("full a", 1), news("full b", 1)], 2);
    expect(picked.map((p) => p.title)).toEqual(["full a", "full b"]);
  });

  it("keeps the arrival order among equally relevant stories", () => {
    const picked = selectNews([news("b", 1), news("a", 1), news("c", 1)], 3);
    expect(picked.map((p) => p.title)).toEqual(["b", "a", "c"]);
  });

  it("does not pass relevance on to the source records", async () => {
    const { toRecords } = await import("../sources");
    expect(toRecords([news("a", 1)])[0]).not.toHaveProperty("relevance");
  });

  it("scores feed items as it parses them", () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel>${["US airlines ground flights after IT outage", "US airlines announce new routes", "Weather today"]
      .map((t, i) => `<item><title>${t}</title><link>https://n.example/${i}</link></item>`)
      .join("")}</channel></rss>`;
    const items = parseFeed(xml, { provider: "N RSS", publisher: "N", country: null, url: "https://n.example/rss", desk: "national" }, "usa airlines outage");
    expect(items.map((i) => [i.title, i.relevance])).toEqual([
      ["US airlines ground flights after IT outage", 1],
      ["US airlines announce new routes", 2 / 3],
    ]);
  });
});
