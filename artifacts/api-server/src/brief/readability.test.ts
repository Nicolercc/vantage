import { describe, expect, it } from "vitest";
import { readingGrade, syllables } from "./readability";

describe("syllables", () => {
  it("counts common words the way a reader would", () => {
    expect(syllables("war")).toBe(1);
    expect(syllables("people")).toBe(2);
    expect(syllables("government")).toBe(3);
    expect(syllables("displaced")).toBe(2);
  });
});

describe("readingGrade", () => {
  it("scores short plain sentences low and dense ones high", () => {
    const plain = readingGrade("The war began in 2023. Many people fled. Food is short.")!;
    const dense = readingGrade(
      "Intensifying paramilitary operations have precipitated catastrophic humanitarian deterioration, compounding institutional fragmentation and international diplomatic paralysis.",
    )!;
    expect(plain).toBeLessThan(4);
    expect(dense).toBeGreaterThan(16);
  });

  it("has no grade for text without words", () => {
    expect(readingGrade("")).toBeNull();
    expect(readingGrade("2023 — 47%")).toBeNull();
  });
});
