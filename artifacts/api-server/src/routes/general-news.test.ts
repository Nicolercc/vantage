import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { modelBrief, modelText, resetBriefState, stubRetrieval, type FakeArticle } from "../test/harness";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@workspace/integrations-anthropic-ai", () => ({
  anthropic: { messages: { create } },
}));

import app from "../app";
import { ORIENTATION_MODEL } from "../brief/orientation";
import { GENERAL_PROMPT, SYSTEM_PROMPT } from "../brief/prompt";

const ARTICLES: FakeArticle[] = [
  {
    title: "US airlines ground flights after nationwide booking system outage",
    source: "Example Wire",
    url: "https://example-wire.com/airlines-outage",
    description: "Several carriers said check-in and booking systems failed on Friday morning.",
    pubDate: "Fri, 13 Nov 2026 14:00:00 GMT",
  },
  {
    title: "U.S. carriers resume flights as outage clears",
    source: "Example Times",
    url: "https://example-times.com/outage-clears",
    description: "Airlines said most flights had resumed by the evening.",
    pubDate: "Fri, 13 Nov 2026 22:00:00 GMT",
  },
];

const orientation = (topicType: string) => ({
  topicType,
  inScope: topicType !== "not_news",
  what: "A computer failure stopped airlines checking in passengers.",
  where: "Airports across the United States.",
  who: "Airlines, passengers and the system's supplier.",
  whyItMatters: "Travellers missed flights and connections.",
});

/** A general-writer answer about the outage. S1 and S2 are the two search results. */
function generalBrief(overrides: Record<string, unknown> = {}) {
  return {
    inScope: true,
    topicType: "technology",
    headline: "Booking system outage grounds US airline flights for a day",
    location: { city: "", country: "United States", region: "North America", lat: null, lng: null },
    summary: "A booking system failure grounded flights at several US airlines before service returned.",
    keyFacts: [
      {
        text: "US airlines grounded flights after a nationwide booking system outage.",
        evidence: [{ sourceId: "S1", quote: "US airlines ground flights after nationwide booking system outage" }],
      },
    ],
    coverage: { agreements: [], differences: [] },
    actors: ["US airlines", "Passengers"],
    stakeholders: [
      { name: "US airlines", role: "Their booking systems failed.", stance: "They say service is returning." },
      { name: "Passengers", role: "Their flights were delayed or cancelled.", stance: "They want rebooking and refunds." },
    ],
    relatedEvents: [
      { date: "Jul 2024", title: "Global IT outage", description: "An earlier software failure grounded flights.", type: "incident", place: null, lat: null, lng: null, searchQuery: "global IT outage airlines July 2024" },
    ],
    glossary: [],
    historicalContext: "Airlines rely on a few shared booking systems.",
    keyQuestion: "What caused the failure?",
    modules: {
      business: null,
      disaster: null,
      outage: {
        servicesAffected: ["Check-in", "Booking"],
        status: [
          {
            text: "Airlines said most flights had resumed by the evening.",
            evidence: [{ sourceId: "S2", quote: "Airlines said most flights had resumed by the evening" }],
          },
        ],
      },
    },
    ...overrides,
  };
}

const explore = (topic: string) => request(app).post("/api/intelligence/explore").send({ topic });
/** Writer calls, told apart from the verifier (often the same model) by their instructions. */
const writerCalls = () => create.mock.calls.filter(([args]) => args.system === GENERAL_PROMPT || args.system === SYSTEM_PROMPT);

function answer(type: string, writer: unknown) {
  create.mockImplementation(async ({ model }) =>
    modelText(JSON.stringify(model === ORIENTATION_MODEL ? orientation(type) : writer)),
  );
}

beforeEach(() => {
  create.mockReset();
  resetBriefState(app);
  stubRetrieval({ articles: ARTICLES, feedItems: [], wikipedia: false });
  answer("technology", generalBrief());
});

describe("a news topic that is not a conflict", () => {
  it("briefs 'usa airlines outage' with sources, checked facts and an outage section", async () => {
    const res = await explore("usa airlines outage");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ inScope: true, topicType: "technology" });
    expect(res.body.sources.map((s: { url: string }) => s.url)).toEqual([
      "https://example-wire.com/airlines-outage",
      "https://example-times.com/outage-clears",
    ]);
    expect(res.body.keyFacts).toHaveLength(1);
    expect(res.body.stakeholders.map((s: { name: string }) => s.name)).toEqual(["US airlines", "Passengers"]);
    expect(res.body.modules.outage.servicesAffected).toEqual(["Check-in", "Booking"]);
    expect(res.body.modules.outage.status[0].evidence[0]).toEqual({
      sourceId: "S2",
      quote: "Airlines said most flights had resumed by the evening",
    });
    expect(res.body.modules.business).toBeNull();
    expect(res.body.relatedEvents[0].type).toBe("incident");
    const [writer] = writerCalls();
    expect(writer?.[0].system).toBe(GENERAL_PROMPT);
  });

  it("has no conflict sections, even when the model writes them", async () => {
    answer("technology", generalBrief({ perspectives: modelBrief().perspectives, escalationRisk: "High", casualtyData: modelBrief().casualtyData }));
    const res = await explore("usa airlines outage");
    expect(res.status).toBe(200);
    for (const key of ["perspectives", "escalationRisk", "escalationReason", "affectedPopulation", "casualtyData"]) {
      expect(res.body).not.toHaveProperty(key);
    }
  });

  it("drops a module claim whose quote is not in its source, as it does a key fact", async () => {
    const brief = generalBrief();
    (brief.modules.outage as { status: unknown[] }).status = [
      { text: "Every flight has resumed.", evidence: [{ sourceId: "S2", quote: "every single flight has resumed" }] },
    ];
    answer("technology", brief);
    const res = await explore("usa airlines outage");
    expect(res.status).toBe(200);
    expect(res.body.modules.outage).toEqual({ servicesAffected: ["Check-in", "Booking"], status: [] });
  });

  it("leaves out a module with nothing in it", async () => {
    answer("technology", generalBrief({ modules: { business: { companies: [], marketEffect: [] }, disaster: null, outage: null } }));
    const res = await explore("usa airlines outage");
    expect(res.body.modules).toEqual({ business: null, disaster: null, outage: null });
  });

  it("reads stakeholders that are not a list as none", async () => {
    const { stakeholders: _s, ...noStakeholders } = generalBrief();
    answer("technology", { ...noStakeholders, stakeholders: "none" });
    const res = await explore("usa airlines outage");
    expect(res.status).toBe(200);
    // Stakeholders that are not a list read as an empty list, which the contract allows.
    expect(res.body.stakeholders).toEqual([]);
  });

  it("takes the writer's type when the orientation thought it was not news", async () => {
    answer("not_news", generalBrief({ topicType: "business" }));
    const res = await explore("usa airlines outage");
    expect(res.status).toBe(200);
    expect(res.body.topicType).toBe("business");
    expect(writerCalls()).toHaveLength(1);
  });

  it("records the general writer's decline as not news", async () => {
    answer("not_news", generalBrief({ inScope: false }));
    const res = await explore("usa airlines outage");
    expect(res.body).toMatchObject({ inScope: false, topicType: "not_news" });
  });
});

describe("conflict briefs are unchanged", () => {
  beforeEach(() => {
    stubRetrieval();
  });

  it("uses the conflict writer for a conflict", async () => {
    answer("conflict", modelBrief());
    const res = await explore("Sudan humanitarian access");
    expect(res.status).toBe(200);
    expect(res.body.topicType).toBe("conflict");
    expect(res.body.perspectives).toHaveLength(1);
    expect(res.body).not.toHaveProperty("stakeholders");
    expect(writerCalls()[0]?.[0].system).toBe(SYSTEM_PROMPT);
  });

  it("uses the conflict writer when the topic's type is not known", async () => {
    create.mockImplementation(async ({ model }) =>
      model === ORIENTATION_MODEL ? { content: [], stop_reason: "refusal" } : modelText(JSON.stringify(modelBrief())),
    );
    const res = await explore("Sudan humanitarian access");
    expect(res.status).toBe(200);
    expect(writerCalls()[0]?.[0].system).toBe(SYSTEM_PROMPT);
  });

  it("keeps the conflict writer's instructions exactly as they were", () => {
    // Changing this prompt changes every conflict brief; re-run the evaluation before updating the digest.
    expect(createHash("sha256").update(SYSTEM_PROMPT).digest("hex")).toBe("59651b898f757fe0632640bd813c1a87964cf33f75708206f2fea11928f1741d");
  });

  it("holds the general writer to the conflict writer's quote rules", () => {
    const rules = SYSTEM_PROMPT.slice(SYSTEM_PROMPT.indexOf("SOURCES:"), SYSTEM_PROMPT.indexOf("Return ONLY valid JSON"));
    expect(rules.length).toBeGreaterThan(1000);
    expect(GENERAL_PROMPT).toContain(rules);
  });
});
