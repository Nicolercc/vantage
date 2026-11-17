import { afterEach, describe, expect, it, vi } from "vitest";
import { adaptBrief, uniqueParties } from "./adapter";

type Brief = Parameters<typeof adaptBrief>[0];

function brief(overrides: Partial<Brief> = {}): Brief {
  return {
    headline: "Aid access to El Fasher remains blocked",
    inScope: true,
    generatedAt: "2026-09-12T10:00:00.000Z",
    location: {
      city: "El Fasher",
      country: "Sudan",
      region: "Sub-Saharan Africa",
      lat: 13.63,
      lng: 25.35,
    },
    summary: "Fighting continues.",
    actors: ["SAF", "RSF"],
    perspectives: [],
    relatedEvents: [
      {
        date: "Apr 2023",
        title: "Fighting begins in Khartoum",
        description: "Start of the war.",
        type: "escalation",
        place: "Khartoum, Sudan",
        lat: 15.5,
        lng: 32.56,
        searchQuery: "q",
      },
    ],
    escalationRisk: "High",
    escalationReason: "No ceasefire.",
    historicalContext: "Context.",
    affectedPopulation: "Civilians remain trapped.",
    keyQuestion: "Will corridors open?",
    casualtyData: { description: "d", civilianImpact: "c", allSides: "a" },
    sources: [
      { id: "S1", kind: "news", provider: "p", publisher: "Al Jazeera", title: "T1", url: "https://x.example/1", publishedAt: null, retrievedAt: "2026-09-12T10:00:00.000Z", language: "English", country: "Qatar", excerpt: null },
      { id: "S2", kind: "news", provider: "p", publisher: "Al Jazeera", title: "T2", url: "https://x.example/2", publishedAt: null, retrievedAt: "2026-09-12T10:00:00.000Z", language: "English", country: "Qatar", excerpt: null },
      { id: "S3", kind: "news", provider: "p", publisher: "The Hindu", title: "T3", url: "https://x.example/3", publishedAt: null, retrievedAt: "2026-09-12T10:00:00.000Z", language: "English", country: "India", excerpt: null },
      { id: "S4", kind: "reference", provider: "p", publisher: "Wikipedia", title: "T4", url: "https://x.example/4", publishedAt: null, retrievedAt: "2026-09-12T10:00:00.000Z", language: "English", country: null, excerpt: null },
    ],
    keyFacts: [],
    coverage: { agreements: [], differences: [] },
    retrieval: [],
    ...overrides,
  } as unknown as Brief;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("adaptBrief — baseline", () => {
  it("maps headline, actors and timeline", () => {
    const a = adaptBrief(brief());
    expect(a.title).toBe("Aid access to El Fasher remains blocked");
    expect(a.parties.map((p) => p.name)).toEqual(["SAF", "RSF"]);
    expect(a.timeline).toHaveLength(1);
  });
});

// Regression gates for the trust defects found in the audit.
describe("adaptBrief — trust contract", () => {
  it("shows the server generation time, not the time the page was opened", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T00:00:00.000Z"));
    expect(adaptBrief(brief()).publishedAt).toBe("2026-09-12T10:00:00.000Z");
  });

  it("counts retrieved news articles, outlets and countries; background references are not coverage", () => {
    expect(adaptBrief(brief()).coverage).toEqual({ articles: 3, outlets: 2, countries: 2 });
  });

  it("leaves places with unknown coordinates off the map", () => {
    const a = adaptBrief(
      brief({
        location: { city: "", country: "Sudan", region: "Sub-Saharan Africa", lat: null, lng: null },
      }),
    );
    expect(a.mapEvents).toHaveLength(1);
    expect(a.mapEvents[0]).toMatchObject({ lat: 15.5, lng: 32.56 });
  });
});

describe("uniqueParties", () => {
	it("shows each party once and at most six, for briefs saved with a repeating list", () => {
		const loop = Array.from({ length: 40 }, (_, i) => (i % 2 ? "European Union / Italy" : "Shipping companies"));
		expect(uniqueParties(["Houthis", "United States", ...loop, "united states", "Israel", "Iran", "Egypt"])).toEqual([
			"Houthis",
			"United States",
			"Shipping companies",
			"European Union / Italy",
			"Israel",
			"Iran",
		]);
	});
});

describe("adaptBrief for news that is not a conflict", () => {
  it("adapts a brief with no conflict sections", () => {
    const b = brief({ topicType: "technology", relatedEvents: [] });
    for (const key of ["perspectives", "escalationRisk", "escalationReason", "affectedPopulation", "casualtyData"] as const) {
      delete (b as Record<string, unknown>)[key];
    }
    const a = adaptBrief(b);
    expect(a.escalationLevel).toBeNull();
    expect(a.escalationTag).toBe("");
    expect(a.perspectives).toEqual([]);
  });

  it("draws an outage or an announcement as a plain place, not a strike", () => {
    const event = { date: "Nov 2026", title: "Booking system fails", description: "d", place: "Atlanta, United States", lat: 33.75, lng: -84.39, searchQuery: "q" };
    const a = adaptBrief(
      brief({
        relatedEvents: [
          { ...event, type: "incident" },
          { ...event, type: "announcement" },
        ],
      }),
    );
    expect(a.mapEvents.slice(1).map((m) => m.type)).toEqual(["city", "city"]);
    expect(a.timeline.map((t) => t.type)).toEqual(["event", "now"]);
  });
});
