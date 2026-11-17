import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { modelBrief, modelText, resetBriefState, stubRetrieval } from "../test/harness";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@workspace/integrations-anthropic-ai", () => ({
  anthropic: { messages: { create } },
}));

import app from "../app";
import { ORIENTATION_MODEL } from "../brief/orientation";

const conflict = { topicType: "conflict", inScope: true, what: "Fighting limits access to aid.", where: "Sudan", who: "Armed groups", whyItMatters: "Families need food." };
const notNews = { topicType: "not_news", inScope: false, what: "", where: "", who: "", whyItMatters: "" };

const explore = (topic: string) => request(app).post("/api/intelligence/explore").send({ topic });
const writerCalls = () => create.mock.calls.filter(([args]) => args.model !== ORIENTATION_MODEL).length;

/** The orientation answers `orientation` (after `delayMs`); every other call answers `brief`. */
function answer(orientation: unknown, brief: unknown = modelBrief(), delayMs = 0) {
  create.mockImplementation(async ({ model }) => {
    if (model !== ORIENTATION_MODEL) return modelText(JSON.stringify(brief));
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return modelText(JSON.stringify(orientation));
  });
}

const store = () => (app.locals["briefs"] as { store: { save: (k: string, b: unknown) => Promise<void> } }).store;

const savedDecline = (extra: Record<string, unknown> = {}) => ({
  ...modelBrief(),
  id: "oldDecline01",
  generatedAt: new Date().toISOString(),
  inScope: false,
  sources: [],
  retrieval: [],
  keyFacts: [],
  coverage: { agreements: [], differences: [] },
  verification: { status: "skipped", checked: 0, removed: 0, corrected: 0 },
  ...extra,
});

beforeEach(() => {
  create.mockReset();
  resetBriefState(app);
  stubRetrieval();
  answer(conflict);
});

describe("searches that are not news", () => {
  it("declines without writing when the search is not news and no outlet covers it", async () => {
    stubRetrieval({ articles: [], feedItems: [], wikipedia: false });
    answer(notNews);
    const res = await explore("banana bread recipe");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ inScope: false, topicType: "not_news", headline: "Not a news story" });
    expect(writerCalls()).toBe(0);
  });

  it("still lets the writer decide when outlets do report on it", async () => {
    stubRetrieval({
      articles: [
        { title: "Banana bread recipe tops search trends", source: "Food Wire", url: "https://food.example/1" },
        { title: "Why a banana bread recipe went viral", source: "Kitchen Daily", url: "https://kitchen.example/2" },
      ],
      feedItems: [],
    });
    answer(notNews, { ...modelBrief(), inScope: false });
    const res = await explore("banana bread recipe");
    expect(res.status).toBe(200);
    expect(writerCalls()).toBe(1);
  });
});

describe("the route", () => {
  it("marks a brief the conflict writer accepted as a conflict brief", async () => {
    const res = await explore("Sudan humanitarian access");
    expect(res.body.topicType).toBe("conflict");
  });

  it("does not wait long for a slow orientation", async () => {
    answer(conflict, modelBrief(), 4_000);
    const started = Date.now();
    const res = await explore("Sudan humanitarian access");
    expect(res.status).toBe(200);
    expect(writerCalls()).toBe(1);
    expect(Date.now() - started).toBeLessThan(3_900);
  }, 10_000);
});

describe("saved declines", () => {
  it("writes again a decline saved before topics had a type", async () => {
    await store().save("topic:sudan humanitarian access", savedDecline());
    const res = await explore("Sudan humanitarian access");
    expect(res.status).toBe(200);
    expect(res.body.id).not.toBe("oldDecline01");
    expect(res.body.inScope).toBe(true);
    expect(writerCalls()).toBe(1);
  });

  it("serves a decline that was classified as not news", async () => {
    await store().save("topic:banana bread recipe", savedDecline({ topicType: "not_news" }));
    const res = await explore("banana bread recipe");
    expect(res.body.id).toBe("oldDecline01");
    expect(create).not.toHaveBeenCalled();
  });
});
