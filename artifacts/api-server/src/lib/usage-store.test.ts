import { describe, expect, it } from "vitest";
import { MemoryUsageStore, ResilientUsageStore, type UsageStore } from "./usage-store";

const DAY = 86_400_000;

/** A shared store that can be taken offline. */
function flakyShared() {
  const backing = new MemoryUsageStore();
  const state = { down: false };
  const guard = () => {
    if (state.down) throw new Error("database offline");
  };
  const shared: UsageStore = {
    hit: async (...a) => (guard(), backing.hit(...a)),
    reserve: async (...a) => (guard(), backing.reserve(...a)),
  };
  return { shared, state };
}

describe("ResilientUsageStore", () => {
  it("keeps an exhausted budget exhausted when the shared store goes down", async () => {
    const { shared, state } = flakyShared();
    const store = new ResilientUsageStore(shared);
    expect(await store.reserve("budget", "briefs", DAY, 1)).toBe(true);
    expect(await store.reserve("budget", "briefs", DAY, 1)).toBe(false);
    state.down = true;
    expect(await store.reserve("budget", "briefs", DAY, 1)).toBe(false);
  });

  it("continues a partly used budget from where it was, not from zero", async () => {
    const { shared, state } = flakyShared();
    const store = new ResilientUsageStore(shared);
    expect(await store.reserve("budget", "briefs", DAY, 3)).toBe(true);
    expect(await store.reserve("budget", "briefs", DAY, 3)).toBe(true);
    state.down = true;
    expect(await store.reserve("budget", "briefs", DAY, 3)).toBe(true);
    expect(await store.reserve("budget", "briefs", DAY, 3)).toBe(false);
  });

  it("continues a client's rate-limit count from the shared total", async () => {
    const { shared, state } = flakyShared();
    const store = new ResilientUsageStore(shared);
    await store.hit("rate", "client", 60_000);
    await store.hit("rate", "client", 60_000);
    state.down = true;
    expect(await store.hit("rate", "client", 60_000)).toBe(3);
  });
});

describe("MemoryUsageStore", () => {
  it("does not reset an active budget when many other keys are counted", async () => {
    const store = new MemoryUsageStore(() => 0);
    expect(await store.reserve("budget", "briefs", DAY, 1)).toBe(true);
    for (let i = 0; i < 20_001; i++) await store.hit("rate", `client${i}`, 60_000);
    expect(await store.reserve("budget", "briefs", DAY, 1)).toBe(false);
  });

  it("still forgets windows that have ended", async () => {
    let now = 0;
    const store = new MemoryUsageStore(() => now);
    for (let i = 0; i < 20_001; i++) await store.hit("rate", `client${i}`, 60_000);
    now = 60_000;
    await store.hit("rate", "late", 60_000);
    expect(store.size()).toBe(1);
  });
});
