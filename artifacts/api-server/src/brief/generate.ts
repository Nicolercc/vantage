import { anthropic } from "@workspace/integrations-anthropic-ai";
import { ExploreConflictResponse } from "@workspace/api-zod";
import { newBriefId } from "../lib/brief-store";
import { AppError } from "../lib/errors";
import { recordModelCall } from "../lib/ledger";
import { classifyModelError, noteModelFailure, noteModelSuccess } from "../lib/model-health";
import { logger } from "../lib/logger";
import { NEVER, until } from "./abort";
import { GEOCODER_BUDGET_MS, locateBrief } from "./geocode";
import { extractJSON, normalizeLatLng, tryExtractJsonFallback, uniqueActors, normalizeGlossary } from "./json";
import { getOrientation, type Orientation } from "./orientation";
import { buildUserMessage, GENERAL_PROMPT, SYSTEM_PROMPT } from "./prompt";
import { RETRIEVAL_MAX_MS, searchCoverage, type Coverage } from "./retrieval";
import { toPublicSource, type Candidate } from "./sources";
import { checkClaims } from "./support";
import { VERIFIER_TIMEOUT_MS, verifyClaims } from "./verify";

const BRIEF_MODEL = process.env["BRIEF_MODEL"] ?? "claude-haiku-4-5-20251001";
const MODEL_TIMEOUT_MS = Number(process.env["BRIEF_MODEL_TIMEOUT_MS"] ?? 60_000);
/** A provider error this soon is a refusal or a blip, not a slow answer, and is worth one more try. */
const QUICK_FAILURE_MS = 10_000;
/** One retry when the model's answer is unusable, or when the provider fails quickly. */
const MAX_GENERATION_ATTEMPTS = 2;
/** The SDK's own timeout plus this is when a model call is aborted outright. */
const ABORT_GRACE_MS = 2_000;
/** Each attempt calls the verifier at most twice: the claims, then any rewrites. */
const VERIFIER_CALLS_PER_ATTEMPT = 2;

/** Longest the writer waits for the orientation after retrieval has finished. */
const ORIENTATION_GRACE_MS = 2_000;

/**
 * Longest one brief may take: every step's own limit, one after the other,
 * plus a margin. Each step already stops itself; this bounds the chain, so a
 * brief that hits several slow steps in a row still ends.
 */
export const BRIEF_DEADLINE_MS =
  RETRIEVAL_MAX_MS +
  ORIENTATION_GRACE_MS +
  MAX_GENERATION_ATTEMPTS *
    (MODEL_TIMEOUT_MS + ABORT_GRACE_MS + VERIFIER_CALLS_PER_ATTEMPT * (VERIFIER_TIMEOUT_MS + ABORT_GRACE_MS)) +
  GEOCODER_BUDGET_MS +
  5_000;

/**
 * The stored contract leaves the conflict sections optional, because briefs on
 * other news have none. A conflict brief must still have every one of them.
 */
export const ConflictBrief = ExploreConflictResponse.required({
  perspectives: true,
  escalationRisk: true,
  escalationReason: true,
  affectedPopulation: true,
  casualtyData: true,
});

/** A not-news search with at least this many news sources is still given to the writer. */
const MIN_NEWS_TO_WRITE = 2;

const delay = <T>(ms: number, value: T) =>
  new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(value), ms);
    t.unref?.();
  });

/**
 * The brief for a search that is not a news story. Nothing is written by the
 * writer; it records what was searched and says so plainly.
 */
function declineBrief(briefId: string, coverage: Coverage, orientation: Orientation | null) {
  return ExploreConflictResponse.parse({
    id: briefId,
    generatedAt: new Date().toISOString(),
    inScope: false,
    topicType: "not_news",
    orientation,
    headline: "Not a news story",
    location: { city: "", country: "", region: "", lat: null, lng: null },
    glossary: null,
    summary: "This search does not look like a news story, so no brief was written.",
    actors: [],
    relatedEvents: [],
    historicalContext: "",
    keyQuestion: "",
    keyFacts: [],
    coverage: { agreements: [], differences: [] },
    verification: { status: "skipped", checked: 0, removed: 0, corrected: 0 },
    sources: coverage.sources.map(toPublicSource),
    retrieval: coverage.retrieval,
  });
}

/** A brief on any other news must say who is involved, and has no conflict sections. */
export const GeneralBrief = ExploreConflictResponse.required({ stakeholders: true, modules: true });

export type TopicType = NonNullable<ReturnType<typeof ExploreConflictResponse.parse>["topicType"]>;
const GENERAL_TYPES = new Set<TopicType>(["politics", "business", "technology", "science_health", "disaster", "society"]);
const CONFLICT_ONLY = ["perspectives", "escalationRisk", "escalationReason", "affectedPopulation", "casualtyData"] as const;

/**
 * Which writer briefs a topic. Conflicts, and any topic whose type is not
 * known, get the conflict writer, exactly as before general news existed;
 * every other type, including a "not news" search that outlets do report on,
 * gets the general writer.
 */
export type Route = "conflict" | TopicType;
const isGeneral = (route: Route) => route !== "conflict";

const timedOut = () => new AppError(504, "TIMED_OUT", "This brief took too long to prepare. Please try again.");

const providerUnavailable = (cause: unknown) =>
  new AppError(502, "PROVIDER_UNAVAILABLE", "The analysis service is unavailable right now. Please try again later.", { cause });

/** What the claim checks did to one model answer; the evaluation reads this. */
export type GenerationStats = {
  claimsProposed: number;
  claimsKept: number;
  /** Why the quote checks discarded each claim they discarded. */
  dropped: string[];
  /** Claims the verifier removed after they had passed the quote checks. */
  rejected: Array<{ text: string; verdict: string; why: string }>;
  attempts: number;
  usage: { inputTokens: number; outputTokens: number };
  verifierUsage: { inputTokens: number; outputTokens: number };
};

/** One model call, parsed and checked against the evidence and the response contract. */
async function generateOnce(coverage: Coverage, userMessage: string, route: Route, onProgress: OnProgress, signal: AbortSignal, briefId: string) {
  const general = isGeneral(route);
  const started = Date.now();
  let message;
  try {
    message = await anthropic.messages.create(
      {
        model: BRIEF_MODEL,
        max_tokens: 6000,
        system: general ? GENERAL_PROMPT : SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      },
      // One attempt with a hard deadline: a reader should get an answer or a
      // "try again" within about a minute, never wait out silent retries.
      { timeout: MODEL_TIMEOUT_MS, maxRetries: 0, signal: until(signal, MODEL_TIMEOUT_MS + ABORT_GRACE_MS) },
    );
  } catch (err) {
    recordModelCall({ briefId, purpose: "writer", model: BRIEF_MODEL, inputTokens: 0, outputTokens: 0, ms: Date.now() - started, ok: false });
    // Our own deadline cut the call short: that says nothing about the provider.
    if (signal.aborted) throw timedOut();
    noteModelFailure(err);
    throw providerUnavailable(err);
  }
  noteModelSuccess();
  recordModelCall({
    briefId,
    purpose: "writer",
    model: BRIEF_MODEL,
    inputTokens: message.usage?.input_tokens ?? 0,
    outputTokens: message.usage?.output_tokens ?? 0,
    ms: Date.now() - started,
    ok: true,
  });

  const block = message.content[0];
  if (!block || block.type !== "text") throw new Error("model returned no text");

  let parsed: Record<string, unknown>;
  try {
    parsed = extractJSON(block.text) as typeof parsed;
  } catch (parseErr) {
    // Sometimes the model wraps JSON in extra prose — take last ```json block or last { ... }
    const fallback = tryExtractJsonFallback(block.text);
    if (!fallback) throw parseErr;
    parsed = fallback as typeof parsed;
  }

  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const rawLoc = (parsed["location"] && typeof parsed["location"] === "object" ? parsed["location"] : {}) as Record<string, unknown>;
  const rawCoverage = (parsed["coverage"] && typeof parsed["coverage"] === "object" ? parsed["coverage"] : {}) as Record<string, unknown>;

  // First check, no model: every quote is really in its source, and the claim's
  // figures are in its quotes. A comparison needs quotes from two sources.
  const rawModules = (general && parsed["modules"] && typeof parsed["modules"] === "object" ? parsed["modules"] : {}) as Record<string, unknown>;
  const moduleOf = (name: string) => {
    const m = rawModules[name];
    return m && typeof m === "object" ? (m as Record<string, unknown>) : null;
  };
  // Each module's time-sensitive part is a list of claims, checked like key facts.
  const MODULES = [
    { name: "business", names: "companies", claims: "marketEffect" },
    { name: "disaster", names: "affectedAreas", claims: "officialGuidance" },
    { name: "outage", names: "servicesAffected", claims: "status" },
  ] as const;
  const quoted = {
    // More candidates than will be shown: some will not survive the second check.
    keyFacts: checkClaims(parsed["keyFacts"], coverage.sources, 9),
    agreements: checkClaims(rawCoverage["agreements"], coverage.sources, 3, 2),
    differences: checkClaims(rawCoverage["differences"], coverage.sources, 3, 2),
  };
  const moduleClaims = general ? MODULES.map((m) => checkClaims(moduleOf(m.name)?.[m.claims], coverage.sources, 3)) : [];
  const dropped = [...quoted.keyFacts.dropped, ...quoted.agreements.dropped, ...quoted.differences.dropped, ...moduleClaims.flatMap((c) => c.dropped)];
  if (dropped.length > 0) logger.info({ dropped }, "claims failed the quote checks");

  // Second check: another model reads each claim against its quotes.
  onProgress({ type: "stage", stage: "checking" });
  const verified = await verifyClaims(
    [quoted.keyFacts.kept, quoted.agreements.kept, quoted.differences.kept, ...moduleClaims.map((c) => c.kept)],
    coverage.sources,
    briefId,
    signal,
  );
  if (verified.removed.length > 0) logger.info({ removed: verified.removed }, "claims removed by the verifier");
  // Pasted text is checked against but never sent back or stored, so a quote
  // from it is withheld. (An article supplied by link is public and is quoted.)
  const privateIds = new Set(coverage.sources.filter((src) => src.kind === "article" && src.url === null).map((src) => src.id));
  const LIMITS = [6, 3, 2, 3, 3, 3];
  const [keyFacts = [], agreements = [], differences = [], ...checkedModuleClaims] = verified.groups.map((group, i) =>
    group.slice(0, LIMITS[i]).map((claim) => ({
      ...claim,
      evidence: claim.evidence.map((e) => (privateIds.has(e.sourceId) ? { ...e, quote: "" } : e)),
    })),
  );
  const claimsKept = keyFacts.length + agreements.length + differences.length + checkedModuleClaims.flat().length;

  // Names are background; a module with nothing left in it is left out.
  const names = (v: unknown) =>
    (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 8);
  const modules = general
    ? Object.fromEntries(
        MODULES.map((m, i) => {
          const raw = moduleOf(m.name);
          const listed = names(raw?.[m.names]);
          const claims = checkedModuleClaims[i] ?? [];
          return [m.name, raw && (listed.length > 0 || claims.length > 0) ? { [m.names]: listed, [m.claims]: claims } : null];
        }),
      )
    : undefined;
  const stakeholders = general
    ? (Array.isArray(parsed["stakeholders"]) ? (parsed["stakeholders"] as Array<Record<string, unknown>>) : [])
        .map((x) => ({ name: str(x?.["name"]).trim(), role: str(x?.["role"]).trim(), stance: str(x?.["stance"]).trim() }))
        .filter((x) => x.name)
        .slice(0, 6)
    : undefined;

  // An out-of-scope topic has no risk level, parties or timeline. The model
  // sometimes says so with "N/A" or by leaving fields out, which would fail the
  // contract and surface as an error. The reader is only ever shown a notice
  // for such a brief, so the unused fields are given neutral values.
  const outOfScope = parsed["inScope"] === false;
  const neutral = outOfScope && general
    ? {
        headline: str(parsed["headline"]) || "Not a news story",
        summary: str(parsed["summary"]) || "This search does not look like a news story.",
        actors: [],
        stakeholders: [],
        relatedEvents: [],
        historicalContext: "",
        keyQuestion: "",
        modules: null,
      }
    : outOfScope
    ? {
        headline: str(parsed["headline"]) || "Outside scope",
        summary: str(parsed["summary"]) || "This topic is not a conflict, humanitarian crisis or geopolitical tension.",
        actors: [],
        perspectives: [],
        relatedEvents: [],
        escalationRisk: "Low",
        escalationReason: "",
        historicalContext: "",
        affectedPopulation: "",
        keyQuestion: "",
        casualtyData: { description: "", civilianImpact: "", allSides: "" },
      }
    : {};

  // Provenance fields are set here and never by the model. The schema parse
  // strips anything outside the contract and rejects missing or mistyped fields.
  // The general writer's own classification only matters when the
  // orientation said "not news" and the writer found news after all.
  const writerType = GENERAL_TYPES.has(parsed["topicType"] as TopicType) ? (parsed["topicType"] as TopicType) : "society";
  const topicType: TopicType | undefined = !general
    ? outOfScope ? undefined : "conflict"
    : outOfScope ? "not_news" : route === "not_news" ? writerType : (route as TopicType);
  // A brief on other news never shows conflict sections, whatever the model wrote.
  const ownFields = general ? Object.fromEntries(Object.entries(parsed).filter(([k]) => !(CONFLICT_ONLY as readonly string[]).includes(k))) : parsed;
  const candidate = {
    ...ownFields,
    ...(topicType ? { topicType } : {}),
    ...(general ? { stakeholders, modules } : {}),
    orientation: null,
    id: briefId,
    generatedAt: new Date().toISOString(),
    inScope: parsed["inScope"] !== false,
    location: {
      city: str(rawLoc["city"]),
      country: str(rawLoc["country"]),
      region: str(rawLoc["region"]),
      ...normalizeLatLng(rawLoc["lat"], rawLoc["lng"]),
    },
    actors: uniqueActors(parsed["actors"]),
    relatedEvents: Array.isArray(parsed["relatedEvents"])
      ? (parsed["relatedEvents"] as Array<Record<string, unknown>>).map((ev) => ({
          ...ev,
          ...normalizeLatLng(ev?.["lat"], ev?.["lng"]),
          place: str(ev?.["place"]).trim() || null,
          searchQuery: str(ev?.["searchQuery"]),
        }))
      : parsed["relatedEvents"],
    ...neutral,
    keyFacts,
    coverage: { agreements, differences },
    verification: verified.verification,
    sources: coverage.sources.map(toPublicSource),
    retrieval: coverage.retrieval,
  };

  // A definition is kept only for a term the reader can find on the page.
  const list = (v: unknown) => (Array.isArray(v) ? (v as Array<Record<string, unknown>>) : []);
  const casualty = (parsed["casualtyData"] ?? {}) as Record<string, unknown>;
  const glossary = normalizeGlossary(parsed["glossary"], [
    parsed["headline"],
    parsed["summary"],
    ...list(parsed["actors"]),
    ...[...keyFacts, ...agreements, ...differences].map((claim) => claim.text),
    ...list(candidate.relatedEvents).flatMap((event) => [event?.["title"], event?.["description"]]),
    ...list(parsed["perspectives"]).flatMap((p) => [p?.["actor"], p?.["framing"], p?.["interests"]]),
    parsed["escalationReason"],
    parsed["keyQuestion"],
    parsed["historicalContext"],
    parsed["affectedPopulation"],
    casualty["description"],
    casualty["civilianImpact"],
    casualty["allSides"],
    ...(stakeholders ?? []).flatMap((x) => [x.name, x.role, x.stance]),
    ...checkedModuleClaims.flat().map((claim) => claim.text),
  ]);
  const checked = (general ? GeneralBrief : ConflictBrief).safeParse({ ...candidate, glossary });
  if (!checked.success) {
    throw new Error(`brief failed contract: ${checked.error.issues.slice(0, 5).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  }
  if (!checked.data.headline.trim() || !checked.data.summary.trim()) {
    throw new Error("brief has an empty headline or summary");
  }
  return {
    brief: checked.data,
    stats: {
      claimsProposed: claimsKept + dropped.length + verified.removed.length,
      claimsKept,
      dropped,
      rejected: verified.removed,
      verifierUsage: verified.usage,
      usage: { inputTokens: message.usage?.input_tokens ?? 0, outputTokens: message.usage?.output_tokens ?? 0 },
    },
  };
}

/** What a brief is doing right now, for readers watching it being built. */
export type BriefProgress =
  | { type: "stage"; stage: "retrieving" | "writing" | "checking" | "locating" }
  | { type: "orientation"; orientation: Orientation }
  | { type: "sources"; sources: ReturnType<typeof toPublicSource>[]; retrieval: Coverage["retrieval"] };
export type OnProgress = (event: BriefProgress) => void;

export type BriefInput = {
  /** Search terms for retrieval. */
  topic: string;
  /** The article the reader supplied, when there is one. */
  article?: { text: string; url: string | null };
};

export async function buildBrief(input: BriefInput, onProgress: OnProgress = () => {}) {
  const supplied: Candidate | undefined = input.article && {
    kind: "article",
    provider: "Reader",
    publisher: input.article.url ? new URL(input.article.url).hostname.replace(/^www\./, "") : "Pasted text",
    title: input.article.url ? "Article supplied by link" : "Article supplied as text",
    url: input.article.url,
    publishedAt: null,
    language: null,
    country: null,
    // The reader's text is not echoed back; it is only used for analysis and support checks.
    excerpt: null,
    text: input.article.text,
  };

  // One deadline for the whole brief. When it passes, everything still running
  // is aborted and the reader gets an error, never a partly built brief.
  const stop = new AbortController();
  const expired = new Promise<never>((_resolve, reject) => {
    stop.signal.addEventListener("abort", () => reject(timedOut()), { once: true });
  });
  const timer = setTimeout(() => stop.abort(), BRIEF_DEADLINE_MS);
  timer.unref?.();
  const briefId = newBriefId();
  const orientationStop = new AbortController();
  const orientationSignal = AbortSignal.any([stop.signal, orientationStop.signal]);
  let orientation: Orientation | null = null;
  const work = (async () => {
    onProgress({ type: "stage", stage: "retrieving" });
    const oriented = getOrientation(input.article?.text.slice(0, 2000) ?? input.topic, briefId, orientationSignal).then((result) => {
      if (!result || orientationSignal.aborted) return null;
      orientation = result;
      onProgress({ type: "orientation", orientation: result });
      return result;
    });
    const coverage = await searchCoverage(input.topic, supplied, stop.signal);
    onProgress({ type: "sources", sources: coverage.sources.map(toPublicSource), retrieval: coverage.retrieval });
    // The route is decided once, here. Orientation usually finished during
    // retrieval; if not, it gets a short grace period and is then ignored.
    const waitStarted = Date.now();
    const classified = await Promise.race([oriented, delay(ORIENTATION_GRACE_MS, null)]);
    const waitedMs = Date.now() - waitStarted;
    if (waitedMs > 50) logger.info({ briefId, waitedMs, classified: Boolean(classified) }, "waited for orientation");
    const topicType = classified?.topicType;
    const newsSources = coverage.sources.filter((src) => src.kind === "news").length;
    // A typed search that is plainly not news (a recipe, homework) and that no
    // outlet reports on is declined without writing. Anything less clear, and
    // any article a reader supplied, goes to the writer, which can decline too.
    if (topicType === "not_news" && !supplied && newsSources < MIN_NEWS_TO_WRITE) {
      return declineBrief(briefId, coverage, classified);
    }
    const { brief } = await generateFromCoverage(
      coverage,
      { topic: input.topic, hasArticle: Boolean(supplied), topicType },
      onProgress,
      stop.signal,
      briefId,
    );
    return { ...brief, orientation };
  })();
  try {
    return await Promise.race([work, expired]);
  } finally {
    orientationStop.abort();
    clearTimeout(timer);
  }
}

/**
 * Brief a fixed set of sources. Retrieval is the caller's business, so the
 * evaluation can replay stored sources through exactly the production path.
 */
export async function generateFromCoverage(
  coverage: Coverage,
  request: { topic: string; hasArticle: boolean; topicType?: TopicType },
  onProgress: OnProgress = () => {},
  signal: AbortSignal = NEVER,
  briefId = newBriefId(),
) {
  const userMessage = buildUserMessage(coverage.sources, request);
  const route: Route = !request.topicType || request.topicType === "conflict" ? "conflict" : request.topicType;

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    if (signal.aborted) throw timedOut();
    const attemptStarted = Date.now();
    try {
      onProgress({ type: "stage", stage: "writing" });
      const { brief, stats } = await generateOnce(coverage, userMessage, route, onProgress, signal, briefId);
      onProgress({ type: "stage", stage: "locating" });
      logger.info({ sources: coverage.sources.length, attempt, ...stats.usage, claimsKept: stats.claimsKept }, "brief generated");
      // The model's coordinates are a guess; the map shows only looked-up places.
      return { brief: await locateBrief(brief, signal), stats: { ...stats, attempts: attempt } satisfies GenerationStats };
    } catch (err) {
      if (signal.aborted) throw timedOut();
      if (err instanceof AppError) {
        // A refusal (bad key, no credit) will be refused again; only a blip is worth a second try.
        const refused = classifyModelError(err.cause).kind === "refused";
        const quick = !refused && Date.now() - attemptStarted < QUICK_FAILURE_MS;
        if (!quick || attempt === MAX_GENERATION_ATTEMPTS) throw err;
      }
      lastError = err;
    }
  }
  if (lastError instanceof AppError) throw lastError;
  throw new AppError(502, "MODEL_OUTPUT_INVALID", "The analysis came back incomplete. Please try again.", { cause: lastError });
}
