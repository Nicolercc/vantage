import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { GetTrendingResponse } from "@workspace/api-zod";
import { modelBrief, modelText, resetBriefState, stubRetrieval, type FakeArticle, type FakeFeedItem } from "../test/harness";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@workspace/integrations-anthropic-ai", () => ({
  anthropic: { messages: { create } },
}));

import app from "../app";
import { TrendingService } from "../brief/trending-service";
import type { HeadlinePull } from "../brief/retrieval/headlines";
import type { BriefState } from "../lib/brief-state";
import { DAY_MS } from "../lib/limits";
import { ORIENTATION_MODEL } from "../brief/orientation";

/**
 * Briefs written, counted by writer calls. Every brief also makes a small
 * orientation call to another model, which is not a brief of its own.
 */
const writerCalls = () => create.mock.calls.filter(([params]) => params.model !== ORIENTATION_MODEL).length;

const state = () => app.locals["briefs"] as BriefState;
const service = () => app.locals["trending"] as TrendingService;
const rfc822 = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toUTCString();

// Three outlets on Sudan within the day: one publisher feed and two outlets found by search.
const FEED: FakeFeedItem[] = [
  {
    title: "Sudan: aid trucks attacked near El Fasher",
    description: "Agencies say trucks were attacked.",
    link: "https://www.aljazeera.com/news/sudan-trucks",
    pubDate: rfc822(1),
  },
  { title: "Football leaders meet in Berlin", description: "Sport.", link: "https://www.aljazeera.com/sports/x", pubDate: rfc822(1) },
];
const SEARCH: FakeArticle[] = [
  { title: "Sudan fighting displaces thousands", source: "Example News", url: "https://example-news.org/sudan", description: "", pubDate: rfc822(2) },
  { title: "Sudan army and RSF clash in Kordofan", source: "Example Wire", url: "https://example-wire.com/sudan", description: "", pubDate: rfc822(3) },
  { title: "Old Sudan war story", source: "Example Weekly", url: "https://example-weekly.com/old", description: "", pubDate: rfc822(30) },
];

const trending = () => request(app).get("/api/trending");

beforeEach(() => {
  create.mockReset();
  resetBriefState(app);
  stubRetrieval({ feedItems: FEED, articles: SEARCH });
  create.mockImplementation(async () => modelText(JSON.stringify(modelBrief())));
});

describe("GET /api/trending", () => {
  it("answers with no topics, in the contract's shape, before anything has been ranked", async () => {
    service().stop(); // keep the lazy refresh from starting
    const res = await trending();
    expect(res.status).toBe(200);
    expect(GetTrendingResponse.parse(res.body)).toEqual({ updatedAt: null, windowHours: 24, outletCount: 0, topics: [] });
  });

  it("ranks the live feeds and search without calling the model, and briefs nothing on the first refresh", async () => {
    await service().refresh();
    const res = await trending();
    const body = GetTrendingResponse.parse(res.body);
    expect(res.headers["cache-control"]).toBe("public, max-age=60");
    expect(body.topics).toEqual([
      {
        label: "Sudan",
        country: "Sudan",
        outletCount: 3,
        newestAt: expect.any(String),
        headline: { title: "Sudan: aid trucks attacked near El Fasher", publisher: "Al Jazeera", url: "https://www.aljazeera.com/news/sudan-trucks" },
        briefId: null,
      },
    ]);
    // Al Jazeera, Example News and Example Wire (the 30-hour-old story is out of the window).
    expect(body.outletCount).toBe(3);
    expect(writerCalls()).toBe(0);
  });

  it("warms the top topic on the next refresh, and a reader asking for it is answered from that brief", async () => {
    await service().refresh();
    await service().refresh();
    expect(writerCalls()).toBe(1);
    const { topics } = GetTrendingResponse.parse((await trending()).body);
    expect(topics[0]?.briefId).toEqual(expect.any(String));

    const calls = writerCalls();
    const read = await request(app).post("/api/intelligence/explore").send({ topic: "  sudan " });
    expect(read.status).toBe(200);
    expect(read.body.id).toBe(topics[0]?.briefId);
    expect(writerCalls()).toBe(calls);

    // A ready brief is not written again on the following refresh.
    await service().refresh();
    expect(writerCalls()).toBe(calls);
  });

  it("counts a warmed brief against the shared daily budget and the cost ledger", async () => {
    await service().refresh();
    await service().refresh();
    const costs = await state().ledger.daily(1);
    expect(costs.find((c) => c.purpose === "writer")?.calls).toBe(1);
    // The budget is 300 a day; one unit is gone.
    let left = 0;
    while (await state().usage.reserve("budget", "briefs", DAY_MS, 300)) left += 1;
    expect(left).toBe(299);
  });

  it("does not mark an out-of-scope brief as ready", async () => {
    create.mockImplementation(async () => modelText(JSON.stringify(modelBrief({ inScope: false }))));
    await service().refresh();
    await service().refresh();
    expect(writerCalls()).toBeGreaterThan(0);
    const { topics } = GetTrendingResponse.parse((await trending()).body);
    expect(topics[0]?.briefId).toBeNull();
  });
});

describe("warming within the budget", () => {
  const pull = async (): Promise<HeadlinePull> => {
    const at = new Date(Date.now() - 3_600_000).toISOString();
    const h = (title: string, publisher: string) => ({ title, publisher, url: `https://${publisher}.example/${title.length}`, publishedAt: at });
    return {
      headlines: [
        h("Sudan fighting kills ten", "a"),
        h("Sudan aid blocked", "b"),
        h("Sudan war: talks stall", "c"),
        h("Haiti gangs attack police", "a"),
        h("Haiti crisis deepens", "b"),
      ],
      providers: [{ provider: "fake", status: "ok" }],
    };
  };
  const make = (settings: Partial<BriefState["config"]["trending"]> = {}, now = Date.now) =>
    new TrendingService(state(), { enabled: true, intervalMs: 3_600_000, pregenerate: 4, dailyMax: 24, ...settings }, { pull, now });

  it("warms no more than its own daily cap", async () => {
    const svc = make({ dailyMax: 1 });
    await svc.refresh();
    await svc.refresh();
    expect(writerCalls()).toBe(1);
    await svc.refresh();
    expect(writerCalls()).toBe(1);
  });

  it("warms only as many topics as asked, and nothing when set to zero", async () => {
    const one = make({ pregenerate: 1 });
    await one.refresh();
    await one.refresh();
    expect(writerCalls()).toBe(1);
    create.mockClear();
    resetBriefState(app);
    const none = make({ pregenerate: 0 });
    await none.refresh();
    await none.refresh();
    expect(writerCalls()).toBe(0);
  });

  it("spends nothing once the shared daily budget is gone, so readers are refused no sooner", async () => {
    while (await state().usage.reserve("budget", "briefs", DAY_MS, 300));
    const svc = make();
    await svc.refresh();
    await svc.refresh();
    expect(writerCalls()).toBe(0);
    // It gave up at the first refusal: at most that one attempt was charged to its own cap.
    let capLeft = 0;
    while (await state().usage.reserve("budget", "trending", DAY_MS, 24)) capLeft += 1;
    expect(capLeft).toBeGreaterThanOrEqual(23);
  });

  it("keeps the previous topics when most sources fail", async () => {
    let failing = false;
    const svc = new TrendingService(
      state(),
      { enabled: true, intervalMs: 3_600_000, pregenerate: 0, dailyMax: 24 },
      {
        now: Date.now,
        pull: async () =>
          failing
            ? { headlines: [], providers: [{ provider: "a", status: "failed" }, { provider: "b", status: "failed" }, { provider: "c", status: "ok" }] }
            : pull(),
      },
    );
    await svc.refresh();
    failing = true;
    await svc.refresh();
    expect(svc.current()?.topics.map((t) => t.label)).toEqual(["Sudan", "Haiti"]);
  });

  it("stops showing a ranking that is too old to call today", async () => {
    let now = Date.now();
    const svc = make({ pregenerate: 0 }, () => now);
    await svc.refresh();
    expect(svc.current()).not.toBeNull();
    svc.stop(); // no catch-up refresh in this test
    now += svc.maxAgeMs + 1;
    expect(svc.current()).toBeNull();
  });

  it("starts at once, refreshes on its interval, and stops cleanly", async () => {
    vi.useFakeTimers({ now: Date.now(), toFake: ["setInterval", "clearInterval"] });
    try {
      const calls = vi.fn(pull);
      const svc = new TrendingService(state(), { enabled: true, intervalMs: 60_000, pregenerate: 0, dailyMax: 24 }, { pull: calls, now: Date.now });
      svc.start();
      svc.start(); // a second start is ignored
      expect(calls).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(calls).toHaveBeenCalledTimes(2);
      svc.stop();
      await vi.advanceTimersByTimeAsync(180_000);
      expect(calls).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does nothing when switched off", async () => {
    const calls = vi.fn(pull);
    const svc = new TrendingService(state(), { enabled: false, intervalMs: 60_000, pregenerate: 4, dailyMax: 24 }, { pull: calls, now: Date.now });
    svc.start();
    expect(svc.current()).toBeNull();
    expect(calls).not.toHaveBeenCalled();
  });
});
