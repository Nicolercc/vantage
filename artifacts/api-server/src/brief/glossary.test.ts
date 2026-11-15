import { describe, expect, it } from "vitest";
import { normalizeGlossary } from "./json";

const text = ["The RSF and the Sudanese Armed Forces (SAF) have fought since 2023.", "Aid groups warn of famine."];

describe("normalizeGlossary", () => {
  it("keeps definitions for terms on the page, once each, in order", () => {
    expect(
      normalizeGlossary(
        [
          { term: "RSF", meaning: "Rapid Support Forces, a paramilitary group." },
          { term: "rsf", meaning: "A repeat." },
          { term: " SAF ", meaning: " Sudan's national army. " },
        ],
        text,
      ),
    ).toEqual([
      { term: "RSF", meaning: "Rapid Support Forces, a paramilitary group." },
      { term: "SAF", meaning: "Sudan's national army." },
    ]);
  });

  it("drops a term the brief never uses, or one that only appears inside another word", () => {
    expect(normalizeGlossary([{ term: "UNHCR", meaning: "The UN refugee agency." }, { term: "SF", meaning: "Not a word here." }], text)).toEqual([]);
  });

  it("drops overlong or malformed entries and keeps at most eight", () => {
    const long = Array.from({ length: 30 }, () => "word").join(" ");
    expect(normalizeGlossary([{ term: "RSF", meaning: long }, { term: 5, meaning: "x" }, "famine"], text)).toEqual([]);
    const many = Array.from({ length: 12 }, (_, i) => ({ term: `T${String.fromCharCode(65 + i)}`, meaning: "A term." }));
    const page = many.map((m) => m.term).join(" ");
    expect(normalizeGlossary(many, [page])).toHaveLength(8);
  });

  it("returns null when the model gave no list, so old and new briefs read the same", () => {
    expect(normalizeGlossary(undefined, text)).toBeNull();
  });
});
