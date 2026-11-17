import type { CaseResult } from "./run";

import { checkThresholds } from "./thresholds";

type Run = {
  ranAt: string;
  briefModel: string;
  verifierModel: string;
  judgeModel: string;
  results: CaseResult[];
  labelled: null | {
    ran: boolean;
    supported: number;
    supportedRemoved: number;
    unsupportedTotal: number;
    unsupportedReachingVerifier: number;
    unsupportedRemoved: number;
    removed: Array<{ text: string; verdict: string; why: string }>;
  };
};

const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${Math.round((100 * n) / d)}% (${n}/${d})`);
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)].toFixed(1) : "n/a");
const sum = (rows: CaseResult[], f: (r: CaseResult) => number) => rows.reduce((a, r) => a + f(r), 0);

export function renderReport(run: Run): string {
  // Headline numbers and limits are for the conflict cohort; news cases get their own section.
  const all = run.results.filter((r) => (r.cohort ?? "conflict") === "conflict");
  const newsCases = run.results.filter((r) => r.cohort === "news");
  const inScope = all.filter((r) => r.scope.expected);
  const done = inScope.filter((r) => r.ok);
  const judged = sum(done, (r) => r.judged.supported + r.judged.partly + r.judged.unsupported);
  const dropReasons = new Map<string, number>();
  for (const r of done) for (const d of r.claims.dropped) {
    const key = d.replace(/:.*$/, "");
    dropReasons.set(key, (dropReasons.get(key) ?? 0) + 1);
  }
  const reviewed = inScope.filter((r) => r.expected.total > 0 && r.expected.reviewed).length;
  const withFacts = inScope.filter((r) => r.expected.total > 0).length;

  const pastLimit = checkThresholds(run);
  const lines: string[] = [
    "# Brief evaluation",
    "",
    `Run ${run.ranAt.slice(0, 16).replace("T", " ")} UTC · writer \`${run.briefModel}\` · verifier \`${run.verifierModel}\` · grader \`${run.judgeModel}\``,
    "",
    "Each case replays sources recorded on one day through the production pipeline, so scores move only when the prompt, the model or the checks change. Claim support and expected facts are graded by a second model, not by a person.",
    "",
    pastLimit.length === 0
      ? "**Result: every measure is within its limit.**"
      : `**Result: ${pastLimit.length} measure(s) past their limit.**\n\n${pastLimit.map((f) => `- ${f}`).join("\n")}`,
    "",
    "## Headline numbers",
    "",
    "| Measure | Result |",
    "|---|---|",
    `| Briefs produced | ${pct(all.filter((r) => r.ok).length, all.length)} |`,
    `| In-scope / out-of-scope judged correctly | ${pct(all.filter((r) => r.scope.correct).length, all.length)} |`,
    `| Kept claims the grader found fully supported | ${pct(sum(done, (r) => r.judged.supported), judged)} |`,
    `| Kept claims partly supported | ${pct(sum(done, (r) => r.judged.partly), judged)} |`,
    `| Kept claims unsupported | ${pct(sum(done, (r) => r.judged.unsupported), judged)} |`,
    `| Claims discarded by the quote checks | ${pct(sum(done, (r) => r.claims.dropped.length), sum(done, (r) => r.claims.proposed))} |`,
    `| Claims then removed by the verifier | ${pct(sum(done, (r) => r.claims.rejectedByVerifier), sum(done, (r) => r.claims.proposed))} |`,
    `| Briefs where the verifier ran | ${pct(done.filter((r) => r.verification === "verified").length, done.length)} |`,
    `| Expected facts conveyed | ${pct(sum(done, (r) => r.expected.conveyed), sum(inScope, (r) => r.expected.total))} |`,
    `| Main pin in the right region | ${pct(inScope.filter((r) => r.pin === "correct").length, inScope.length)} |`,
    `| Main pin in the wrong region | ${pct(inScope.filter((r) => r.pin === "wrong").length, inScope.length)} |`,
    `| No main pin drawn | ${pct(inScope.filter((r) => r.pin === "none").length, inScope.length)} |`,
    `| Timeline events with a map pin | ${pct(sum(done, (r) => r.eventPins), sum(done, (r) => r.events))} |`,
    `| Reading grade of summaries (median, Flesch-Kincaid; aim 8 or below) | ${median(done.map((r) => r.readingGrade).filter((g): g is number => g !== null))} |`,
    `| Median seconds per brief | ${[...all].map((r) => r.seconds).sort((a, b) => a - b)[Math.floor(all.length / 2)]?.toFixed(0) ?? "n/a"} |`,
    `| Tokens per brief (in / out, mean) | ${Math.round(sum(all, (r) => r.usage.inputTokens) / Math.max(1, all.length))} / ${Math.round(sum(all, (r) => r.usage.outputTokens) / Math.max(1, all.length))} |`,
    "",
    `Expected-fact lists reviewed by a person: ${reviewed} of ${withFacts} cases.`,
    "",
    "## By case",
    "",
    "| Case | Sources | Scope | Claims kept / proposed | Supported / partly / unsupported | Expected facts | Main pin | Event pins | Seconds |",
    "|---|---|---|---|---|---|---|---|---|",
    ...all.map(
      (r) =>
        `| ${r.id} | ${r.sources} | ${r.ok ? (r.scope.correct ? "correct" : "**wrong**") : "**failed**"} | ${r.claims.kept} / ${r.claims.proposed} | ${r.judged.supported} / ${r.judged.partly} / ${r.judged.unsupported} | ${r.expected.total ? `${r.expected.conveyed} / ${r.expected.total}` : "—"} | ${r.pin === "wrong" ? "**wrong**" : r.pin} | ${r.eventPins} | ${r.seconds.toFixed(0)} |`,
    ),
    "",
  ];

  if (newsCases.length > 0) {
    const newsDone = newsCases.filter((r) => r.ok && r.scope.expected);
    const newsJudged = sum(newsDone, (r) => r.judged.supported + r.judged.partly + r.judged.unsupported);
    lines.push(
      "## General news (reported; no limits yet)",
      "",
      "Topics that are not conflicts. Their numbers are kept apart so they can neither hide a conflict regression nor fail a run before they have a history.",
      "",
      `Topic type matched: ${pct(newsCases.filter((r) => r.type.correct).length, newsCases.length)} · briefed: ${pct(newsCases.filter((r) => r.ok && r.scope.correct).length, newsCases.length)} · kept claims fully supported: ${pct(sum(newsDone, (r) => r.judged.supported), newsJudged)} · unsupported: ${pct(sum(newsDone, (r) => r.judged.unsupported), newsJudged)}`,
      "",
      "| Case | Type (expected) | Sources | Briefed | Claims kept / proposed | Supported / partly / unsupported | Expected facts | Seconds |",
      "|---|---|---|---|---|---|---|---|",
      ...newsCases.map(
        (r) =>
          `| ${r.id} | ${r.type.correct ? r.type.got : `**${r.type.got ?? "none"}**`} (${r.type.expected.join(", ")}) | ${r.sources} | ${r.ok ? (r.scope.correct ? "yes" : "**no**") : "**failed**"} | ${r.claims.kept} / ${r.claims.proposed} | ${r.judged.supported} / ${r.judged.partly} / ${r.judged.unsupported} | ${r.expected.total ? `${r.expected.conveyed} / ${r.expected.total}` : "—"} | ${r.seconds.toFixed(0)} |`,
      ),
      "",
    );
  }

  if (run.labelled) {
    const l = run.labelled;
    const caughtByChecks = l.unsupportedTotal - l.unsupportedReachingVerifier;
    lines.push(
      "## Against hand-labelled claims",
      "",
      "These claims have a right answer written down by a person, so this is a measurement and not a model's opinion.",
      "",
      "| Measure | Result |",
      "|---|---|",
      `| Unsupported claims stopped by the quote checks | ${caughtByChecks} of ${l.unsupportedTotal} |`,
      `| Of the rest, removed by the verifier | ${l.unsupportedRemoved} of ${l.unsupportedReachingVerifier} |`,
      `| Unsupported claims that passed both checks | ${l.unsupportedReachingVerifier - l.unsupportedRemoved} of ${l.unsupportedTotal} |`,
      `| Supported claims the verifier wrongly removed | ${l.supportedRemoved} of ${l.supported} |`,
      "",
    );
  }

  if (dropReasons.size > 0) {
    lines.push("## Why the quote checks discarded claims", "", ...[...dropReasons].sort((a, b) => b[1] - a[1]).map(([k, n]) => `- ${k}: ${n}`), "");
  }
  const failures = [...done, ...newsCases.filter((r) => r.ok)].flatMap((r) => r.failures.map((f) => ({ ...f, id: r.id })));
  if (failures.length > 0) {
    lines.push("## Kept claims the grader did not fully support", "");
    for (const f of failures) lines.push(`- **${f.id}** (${f.verdict}, cites ${f.cites.join(", ")}): ${f.claim}`, `  - ${f.why}`);
    lines.push("");
  }
  const missed = done.flatMap((r) => r.expected.missed.map((m) => `- **${r.id}**: ${m}`));
  if (missed.length > 0) lines.push("## Expected facts not conveyed", "", ...missed, "");
  const wrongPins = inScope.filter((r) => r.pin !== "correct").map((r) => `- **${r.id}**: ${r.pin}${r.pinDetail ? ` — ${r.pinDetail}` : ""}`);
  if (wrongPins.length > 0) lines.push("## Main pins that were wrong or missing", "", ...wrongPins, "");
  const errors = run.results.filter((r) => !r.ok).map((r) => `- **${r.id}**: ${r.error}`);
  if (errors.length > 0) lines.push("## Cases that failed to produce a brief", "", ...errors, "");
  return `${lines.join("\n")}\n`;
}
