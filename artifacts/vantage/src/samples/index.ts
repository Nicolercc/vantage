import type { IntelligenceBrief } from "@workspace/api-client-react";

/**
 * Reviewed sample briefs, shipped with the site.
 *
 * A sample is a real brief saved as a versioned file, so its link never
 * depends on the API: a restart, a cold start or an outage can't break it.
 * Each sample gets its own dated slug and file; replacing the sample means
 * adding a new one, never editing an old one. The card fields below repeat a
 * few values from the file so the home page can show the card without
 * downloading the whole brief; `index.test.ts` fails the build if they ever
 * differ from the file, and checks every file against the API contract.
 *
 *   home card ──tap──▶ /sample/:slug ──▶ load() (lazy chunk) ──▶ BriefView
 */
export type Sample = {
	slug: string;
	/** The brief's generation time, ISO 8601. Shown as a UTC calendar date. */
	generatedAt: string;
	country: string;
	headline: string;
	/** One line on why it matters, from the brief's orientation. */
	why: string;
	/** What a person changed before publishing, for the record. */
	review: { by: string; on: string; removedSources: string[]; note: string };
	load: () => Promise<IntelligenceBrief>;
};

export const SAMPLES: Sample[] = [
	{
		slug: "sudan-2026-11-16",
		generatedAt: "2026-11-16T04:00:35.708Z",
		country: "Sudan",
		headline: "Sudan's humanitarian crisis deepens as funding and access collapse",
		why: "Blocked roads and insecurity keep food, medicine, and shelter from reaching families who need them most.",
		review: {
			by: "Vantage",
			on: "2026-11-16",
			removedSources: ["S1", "S4"],
			note: "Removed two off-topic BBC football stories that no claim cited. No claim, quote or fact was changed.",
		},
		// JSON enum values read as plain strings to TypeScript; the contract is
		// enforced by the strict schema test instead of this cast.
		load: () => import("./sudan-2026-11-16.json").then((m) => m.default as unknown as IntelligenceBrief),
	},
];

/** A sample older than this many days is labelled as old on the home page. */
export const STALE_AFTER_DAYS = 14;

export function findSample(slug: string): Sample | undefined {
	return SAMPLES.find((s) => s.slug === slug);
}

/** The newest sample, or undefined when there are none. */
export function latestSample(samples: Sample[] = SAMPLES): Sample | undefined {
	return [...samples].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
}

const DAY_MS = 86_400_000;
const utcDay = (iso: string | number) => {
	const d = new Date(iso);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/** Whole UTC calendar days since the sample was made, the same for every reader. */
export function sampleAgeDays(generatedAt: string, now = Date.now()): number {
	return Math.round((utcDay(now) - utcDay(generatedAt)) / DAY_MS);
}

export function isStale(generatedAt: string, now = Date.now()): boolean {
	return sampleAgeDays(generatedAt, now) > STALE_AFTER_DAYS;
}

/** "Nov 16, 2026": the sample's UTC date, so the banner and card agree in every time zone. */
export function sampleDate(generatedAt: string): string {
	return new Date(generatedAt).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });
}
