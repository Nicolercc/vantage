import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubRetrieval } from "../test/harness";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@workspace/integrations-anthropic-ai", () => ({ anthropic: { messages: { create } } }));

import { AppError } from "../lib/errors";
import { modelProblem, resetModelHealth } from "../lib/model-health";
import { BRIEF_DEADLINE_MS, buildBrief } from "./generate";

/**
 * Each step has its own limit, but a brief chains several of them. The whole
 * brief also has a limit: when it passes, everything still running is
 * aborted and the reader gets a "took too long" error, never a partial brief.
 */
type CallOptions = { signal?: AbortSignal };
const writerSignals: AbortSignal[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  stubRetrieval();
  resetModelHealth();
  writerSignals.length = 0;
  // A writer that never answers; it settles only when its call is aborted.
  create.mockReset().mockImplementation((_params: unknown, options: CallOptions) => {
    if (options.signal) writerSignals.push(options.signal);
    return new Promise((_resolve, reject) => options.signal?.addEventListener("abort", () => reject(options.signal!.reason)));
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("whole-brief deadline", () => {
  it("is every step's own limit in sequence, plus a margin", () => {
    // retrieval 12s (two sequential Wikipedia fetches) + 2 attempts × (writer 62s + 2 verifier calls × 27s) + geocoding 9s + 5s
    expect(BRIEF_DEADLINE_MS).toBe(12_000 + 2 * (62_000 + 2 * 27_000) + 9_000 + 5_000);
  });

  it("aborts work in flight and fails with TIMED_OUT when the deadline passes", async () => {
    let outcome: unknown = "pending";
    buildBrief({ topic: "Sudan El Fasher aid" }).then(
      (brief) => (outcome = brief),
      (err) => (outcome = err),
    );

    await vi.advanceTimersByTimeAsync(BRIEF_DEADLINE_MS - 1);
    expect(outcome).toBe("pending");
    expect(writerSignals).toHaveLength(1);
    expect(writerSignals[0]!.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toBeInstanceOf(AppError);
    expect(outcome).toMatchObject({ status: 504, code: "TIMED_OUT" });
    expect((outcome as AppError).message).toMatch(/took too long/i);
    expect(writerSignals[0]!.aborted).toBe(true);
    // Our own deadline is not the provider refusing requests.
    expect(modelProblem()).toBeNull();
    // and no second writer attempt starts after the deadline
    await vi.advanceTimersByTimeAsync(60_000);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
