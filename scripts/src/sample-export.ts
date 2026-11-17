/**
 * Save a brief as a reviewed sample: the weekly swap for the home page's
 * "Start here" card.
 *
 *   pnpm sample:export "Sudan humanitarian access"     generate a fresh brief
 *   pnpm sample:export --brief dgUvNi4N3nPj            save one you already read
 *   pnpm sample:export --brief dgUvNi4N3nPj --drop S1,S4   ...minus sources nothing cites
 *
 * It checks the brief against the API contract, then writes three things:
 *   artifacts/vantage/src/samples/<country>-<date>.json   the brief itself
 *   artifacts/vantage/src/samples/index.ts                its card entry
 *   artifacts/vantage/api/_samples.js                     its link-preview fields
 * and lists any sources no claim cites, so you can drop them on a second run.
 * It never overwrites an existing sample: a sample's link must keep working.
 * Read the brief before you commit it; then run the vantage tests.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GetBriefResponse } from "@workspace/api-zod";

export type Brief = ReturnType<typeof GetBriefResponse.parse>;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const PATHS = {
	samples: "artifacts/vantage/src/samples",
	registry: "artifacts/vantage/src/samples/index.ts",
	previews: "artifacts/vantage/api/_samples.js",
};

/** "sudan-2026-11-16": the brief's country and its UTC generation date. */
export function sampleSlug(brief: Pick<Brief, "generatedAt" | "location">): string {
	const place = (brief.location.country || brief.location.city || "world")
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	return `${place}-${brief.generatedAt.slice(0, 10)}`;
}

/** Every source id any part of the brief points to, however deep. */
export function citedSourceIds(brief: Brief): Set<string> {
	const ids = new Set<string>();
	const walk = (value: unknown, key?: string): void => {
		if (key === "sources") return;
		if (Array.isArray(value)) {
			for (const v of value) {
				if (key === "sourceIds" && typeof v === "string") ids.add(v);
				else walk(v);
			}
		} else if (value && typeof value === "object") {
			for (const [k, v] of Object.entries(value)) {
				if (k === "sourceId" && typeof v === "string") ids.add(v);
				else walk(v, k);
			}
		}
	};
	walk(brief);
	return ids;
}

export function uncitedSources(brief: Brief): Brief["sources"] {
	const cited = citedSourceIds(brief);
	return brief.sources.filter((s) => !cited.has(s.id));
}

/** The brief as it will ship: dropped sources gone, link marked permanent. */
export function prepareSample(brief: Brief, drop: string[]): Brief {
	const known = new Set(brief.sources.map((s) => s.id));
	const unknown = drop.filter((id) => !known.has(id));
	if (unknown.length) throw new Error(`No source ${unknown.join(", ")} in this brief.`);
	const cited = citedSourceIds(brief);
	const stillCited = drop.filter((id) => cited.has(id));
	if (stillCited.length) throw new Error(`Won't drop ${stillCited.join(", ")}: a claim cites it.`);
	if (!brief.orientation?.whyItMatters) throw new Error("This brief has no 'why it matters' line for the home card.");
	if (brief.inScope === false) throw new Error("This brief is out of scope; pick another.");
	return {
		...brief,
		sources: brief.sources.filter((s) => !drop.includes(s.id)),
		link: { ...brief.link, durable: true },
	} as Brief;
}

const q = (s: string) => JSON.stringify(s);

/** The registry entry, in the same shape as the existing ones. */
export function registryEntry(brief: Brief, slug: string, drop: string[], today: string): string {
	const note = drop.length
		? `Removed ${drop.length} source${drop.length === 1 ? "" : "s"} no claim cited (${drop.join(", ")}). No claim, quote or fact was changed.`
		: "No changes.";
	return `	{
		slug: ${q(slug)},
		generatedAt: ${q(brief.generatedAt)},
		country: ${q(brief.location.country ?? "")},
		headline: ${q(brief.headline)},
		why: ${q(brief.orientation!.whyItMatters!)},
		review: {
			by: "Vantage",
			on: ${q(today)},
			removedSources: ${JSON.stringify(drop)},
			note: ${q(note)},
		},
		load: () => import(${q(`./${slug}.json`)}).then((m) => m.default as unknown as IntelligenceBrief),
	},
`;
}

/** The fields link-preview bots get, matching api/_samples.js. */
export function previewEntry(brief: Brief, slug: string): string {
	const record = {
		id: brief.id,
		sample: slug,
		headline: brief.headline,
		summary: brief.summary,
		generatedAt: brief.generatedAt,
		inScope: brief.inScope,
		location: { city: brief.location.city, country: brief.location.country },
		sources: brief.sources.map((s) => ({ kind: s.kind, publisher: s.publisher })),
	};
	const body = JSON.stringify(record, null, "\t").replace(/\n/g, "\n\t");
	return `	${q(slug)}: ${body},\n`;
}

/** Insert `entry` as the first item after `opener` (the line that opens the list). */
export function insertAfter(source: string, opener: string, entry: string): string {
	const at = source.indexOf(opener);
	if (at === -1) throw new Error(`Couldn't find "${opener.trim()}" to add the entry to.`);
	const end = at + opener.length;
	return source.slice(0, end) + entry + source.slice(end);
}

export type Written = { slug: string; files: string[]; uncited: Brief["sources"] };

/** Write the sample, its registry entry and its preview record under `root`. */
export function writeSample(raw: unknown, drop: string[], root = ROOT, today = new Date().toISOString().slice(0, 10)): Written {
	const parsed = GetBriefResponse.safeParse(raw);
	if (!parsed.success) {
		const issues = parsed.error.issues.slice(0, 5).map((i) => `  ${i.path.join(".")}: ${i.message}`);
		throw new Error(`The brief doesn't match the API contract:\n${issues.join("\n")}`);
	}
	// Keep the API's own JSON (the schema strips unknown keys; the strict test will flag any).
	const brief = prepareSample(raw as Brief, drop);
	const slug = sampleSlug(brief);
	const file = join(root, PATHS.samples, `${slug}.json`);
	if (existsSync(file)) throw new Error(`${slug} already exists. A sample never changes once published; generate a new one.`);

	const registry = join(root, PATHS.registry);
	const previews = join(root, PATHS.previews);
	const nextRegistry = insertAfter(readFileSync(registry, "utf8"), "export const SAMPLES: Sample[] = [\n", registryEntry(brief, slug, drop, today));
	const nextPreviews = insertAfter(readFileSync(previews, "utf8"), "export const SAMPLE_PREVIEWS = {\n", previewEntry(brief, slug));

	writeFileSync(file, `${JSON.stringify(brief, null, "\t")}\n`);
	writeFileSync(registry, nextRegistry);
	writeFileSync(previews, nextPreviews);
	return { slug, files: [file, registry, previews], uncited: uncitedSources(brief) };
}

async function fetchBrief(api: string, args: { brief?: string; topic?: string }): Promise<unknown> {
	const res = args.brief
		? await fetch(`${api}/api/briefs/${encodeURIComponent(args.brief)}`)
		: await fetch(`${api}/api/intelligence/explore`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ topic: args.topic }),
			});
	if (!res.ok) throw new Error(`The API answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
	return res.json();
}

export function parseArgs(argv: string[]) {
	const out: { brief?: string; topic?: string; drop: string[]; api: string } = {
		drop: [],
		api: (process.env.VANTAGE_API ?? "https://conflict-analysis.onrender.com").replace(/\/$/, ""),
	};
	const words: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!;
		if (a === "--brief") out.brief = argv[++i];
		else if (a === "--drop") out.drop = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
		else if (a === "--api") out.api = (argv[++i] ?? "").replace(/\/$/, "");
		else words.push(a);
	}
	if (words.length) out.topic = words.join(" ");
	if (!out.brief && !out.topic) throw new Error('Give a topic, e.g. pnpm sample:export "Sudan humanitarian access", or --brief <id>.');
	return out;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	console.log(args.brief ? `Fetching brief ${args.brief}…` : `Generating a brief for "${args.topic}" (about a minute)…`);
	const raw = await fetchBrief(args.api, args);
	const { slug, files, uncited } = writeSample(raw, args.drop);
	const id = (raw as Brief).id;
	console.log(`\nSaved sample ${slug}:`);
	for (const f of files) console.log(`  ${f.replace(`${ROOT}/`, "")}`);
	if (uncited.length) {
		console.log("\nNo claim cites these sources. Check them; to drop off-topic ones, delete the files above and run:");
		for (const s of uncited) console.log(`  ${s.id}  ${s.publisher}: ${s.title}`);
		console.log(`  pnpm sample:export --brief ${id} --drop ${uncited.map((s) => s.id).join(",")}`);
	}
	console.log(`\nNext: read /sample/${slug}, then run pnpm --filter @workspace/vantage test.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main().catch((err: unknown) => {
		console.error(err instanceof Error ? err.message : err);
		process.exit(1);
	});
}
