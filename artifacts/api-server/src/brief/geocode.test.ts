import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Lookups are queued one gap apart for the provider's sake. Work a brief has
 * stopped waiting for must not keep using that queue: it would spend provider
 * requests on nothing and push the next reader's lookups further back.
 */
const place = (i: number) => ({ place: `Distinct place ${i}`, lat: 15.5, lng: 32.56 });
const brief = (events: number, offset = 0) => ({
  location: { city: "", country: "Sudan", lat: null, lng: null },
  relatedEvents: Array.from({ length: events }, (_, i) => place(i + offset)),
});
const found = () => new Response(JSON.stringify([{ lat: "15.5", lon: "32.56", addresstype: "city" }]));

async function geocoder(env: Record<string, string>, fetchImpl: (url: string, init: RequestInit) => Promise<Response>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const fetchMock = vi.fn(fetchImpl);
  vi.stubGlobal("fetch", fetchMock);
  const mod = await import("./geocode");
  mod.resetGeocoder();
  return { ...mod, fetchMock };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("geocoder deadline", () => {
  it("makes no lookups after the brief has stopped waiting", async () => {
    const { locateBrief, fetchMock } = await geocoder({ GEOCODER_MIN_GAP_MS: "30", GEOCODER_BUDGET_MS: "5" }, async () => found());
    const result = await locateBrief(brief(5));
    await new Promise((r) => setTimeout(r, 200));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.relatedEvents.filter((e) => e.lat === null)).toHaveLength(4);
  });

  it("cancels a lookup still running at the deadline", async () => {
    let signal: AbortSignal | undefined;
    const { locateBrief } = await geocoder({ GEOCODER_MIN_GAP_MS: "0", GEOCODER_BUDGET_MS: "20" }, (_url, init) => {
      signal = init.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
    });
    const result = await locateBrief(brief(1));
    expect(result.relatedEvents[0]!.lat).toBeNull();
    expect(signal?.aborted).toBe(true);
  });

  it("does not hold the queue for the next brief with abandoned work", async () => {
    const { locateBrief } = await geocoder({ GEOCODER_MIN_GAP_MS: "50", GEOCODER_BUDGET_MS: "10" }, async () => found());
    await locateBrief(brief(6));
    // One gap later the queue is free again, unless the five abandoned lookups still hold their slots.
    await new Promise((r) => setTimeout(r, 70));
    const next = await locateBrief(brief(1, 100));
    expect(next.relatedEvents[0]!.lat).toBe(15.5);
  });
});
