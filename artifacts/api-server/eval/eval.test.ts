import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CaseResult } from "./run";
import { checkThresholds } from "./thresholds";
import { TOPICS } from "./topics";

const result = (over: Partial<CaseResult>): CaseResult => ({
  id: "x", topic: "x", sources: 5, ok: true, seconds: 1, cohort: "conflict",
  scope: { expected: true, got: true, correct: true },
  type: { expected: ["conflict"], got: "conflict", correct: true },
  pin: "correct", eventPins: 0, events: 3, readingGrade: 8,
  claims: { proposed: 10, kept: 10, dropped: [], rejectedByVerifier: 0 },
  verification: "verified",
  judged: { supported: 10, partly: 0, unsupported: 0 },
  failures: [],
  expected: { total: 0, conveyed: 0, missed: [], reviewed: false },
  usage: { inputTokens: 0, outputTokens: 0 },
  ...over,
});

describe("evaluation limits", () => {
  it("hold the conflict cohort to its limits", () => {
    const failures = checkThresholds({ labelled: null, results: [result({ judged: { supported: 5, partly: 0, unsupported: 5 } })] });
    expect(failures.join("\n")).toMatch(/unsupported claims/);
  });

  it("leave news cases out, so they neither fail a run nor hide a conflict regression", () => {
    const news = result({ id: "n", cohort: "news", ok: false, scope: { expected: true, got: null, correct: false }, judged: { supported: 0, partly: 0, unsupported: 50 } });
    expect(checkThresholds({ labelled: null, results: [result({}), news] })).toEqual([]);
    const regressed = result({ judged: { supported: 5, partly: 0, unsupported: 5 } });
    const good = result({ id: "g", cohort: "news", judged: { supported: 1000, partly: 0, unsupported: 0 } });
    expect(checkThresholds({ labelled: null, results: [regressed, good] })).not.toEqual([]);
  });

  it("read a report saved before cohorts as all conflict", () => {
    const { cohort: _c, ...old } = result({ scope: { expected: true, got: false, correct: false } });
    expect(checkThresholds({ labelled: null, results: [old as CaseResult] }).join("\n")).toMatch(/scope judged correctly/);
  });
});

describe("evaluation topics", () => {
  it("have a recorded case each", () => {
    for (const t of TOPICS) expect(existsSync(path.join(import.meta.dirname, "cases", `${t.id}.json`)), t.id).toBe(true);
  });

  it("keep the conflict cohort to conflicts and declined searches", () => {
    for (const t of TOPICS.filter((x) => x.cohort === "conflict")) {
      expect(t.types, t.id).toEqual([t.inScope ? "conflict" : "not_news"]);
    }
    expect(TOPICS.filter((t) => t.cohort === "conflict")).toHaveLength(15);
  });
});
