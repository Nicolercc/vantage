import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GetBriefResponse } from "@workspace/api-zod";
import { SAMPLES, findSample, isStale, latestSample, sampleAgeDays, sampleDate, type Sample } from "./index";

/**
 * The generated schemas ignore unknown keys, so a renamed field would pass
 * silently. Make every object in the schema strict, however deep.
 */
function deepStrict(schema: z.ZodTypeAny): z.ZodTypeAny {
	if (schema instanceof z.ZodObject) {
		const shape = Object.fromEntries(Object.entries(schema.shape).map(([k, v]) => [k, deepStrict(v as z.ZodTypeAny)]));
		return z.object(shape).strict();
	}
	if (schema instanceof z.ZodArray) return z.array(deepStrict(schema.element));
	if (schema instanceof z.ZodOptional) return deepStrict(schema.unwrap()).optional();
	if (schema instanceof z.ZodNullable) return deepStrict(schema.unwrap()).nullable();
	if (schema instanceof z.ZodUnion) return z.union(schema.options.map((o: z.ZodTypeAny) => deepStrict(o)));
	return schema;
}
const StrictBrief = deepStrict(GetBriefResponse);

describe("every sample", () => {
	it.each(SAMPLES.map((s) => [s.slug, s] as const))("%s matches the API contract exactly", async (_slug, sample) => {
		const result = StrictBrief.safeParse(await sample.load());
		expect(result.success ? [] : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)).toEqual([]);
	});

	it.each(SAMPLES.map((s) => [s.slug, s] as const))("%s card fields equal the brief they open", async (_slug, sample) => {
		const brief = await sample.load();
		expect(sample.headline).toBe(brief.headline);
		expect(sample.why).toBe(brief.orientation?.whyItMatters);
		expect(sample.country).toBe(brief.location.country);
		expect(sample.generatedAt).toBe(brief.generatedAt);
	});

	it.each(SAMPLES.map((s) => [s.slug, s] as const))("%s keeps every source a claim cites and links permanently", async (_slug, sample) => {
		const brief = await sample.load();
		const ids = new Set(brief.sources.map((s) => s.id));
		const cited = [...brief.keyFacts, ...brief.coverage.agreements, ...brief.coverage.differences].flatMap((c) => c.sourceIds);
		expect(cited.filter((id) => !ids.has(id))).toEqual([]);
		for (const removed of sample.review.removedSources) expect(ids.has(removed)).toBe(false);
		expect(brief.link?.durable).toBe(true);
	});

	it("rejects a sample whose fields were renamed, even deep inside", async () => {
		const brief = structuredClone(await SAMPLES[0].load()) as unknown as Record<string, unknown>;
		const orientation = brief["orientation"] as Record<string, unknown>;
		orientation["whatHappened"] = orientation["what"];
		delete orientation["what"];
		expect(StrictBrief.safeParse(brief).success).toBe(false);
	});

	it("uses unique slugs that carry the sample's UTC date", () => {
		const slugs = SAMPLES.map((s) => s.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
		for (const s of SAMPLES) expect(s.slug.endsWith(s.generatedAt.slice(0, 10))).toBe(true);
	});
});

describe("finding samples", () => {
	const at = (slug: string, generatedAt: string) => ({ ...SAMPLES[0], slug, generatedAt }) as Sample;

	it("finds by slug and returns undefined for an unknown one", () => {
		expect(findSample("sudan-2026-11-16")?.country).toBe("Sudan");
		expect(findSample("nope")).toBeUndefined();
	});

	it("picks the newest sample, and nothing when there are none", () => {
		expect(latestSample([at("a", "2026-11-01T00:00:00Z"), at("b", "2026-11-16T00:00:00Z")])?.slug).toBe("b");
		expect(latestSample([])).toBeUndefined();
	});
});

describe("sample dates are the same for every reader", () => {
	const made = "2026-11-16T04:00:35.708Z";

	it("formats the UTC calendar date, not the reader's local one", () => {
		// 04:00 UTC is still Nov 15 in New York; the banner must say Nov 16 everywhere.
		expect(sampleDate(made)).toBe("Nov 16, 2026");
	});

	it("counts whole UTC days and turns stale after 14", () => {
		const day = (d: number, h = 12) => Date.UTC(2026, 10, 16 + d, h);
		expect(sampleAgeDays(made, day(0, 23))).toBe(0);
		expect(isStale(made, day(13))).toBe(false);
		expect(isStale(made, day(14))).toBe(false);
		expect(isStale(made, day(15))).toBe(true);
		// Just after midnight UTC on day 15 is stale for everyone, wherever they are.
		expect(isStale(made, Date.UTC(2026, 11, 1, 0, 5))).toBe(true);
	});
});
