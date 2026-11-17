import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PATHS, parseArgs, prepareSample, sampleSlug, uncitedSources, writeSample, type Brief } from "./sample-export";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SAMPLE = JSON.parse(readFileSync(join(ROOT, PATHS.samples, "sudan-2026-11-16.json"), "utf8")) as Brief;
const withExtra = (): Brief =>
	({
		...structuredClone(SAMPLE),
		generatedAt: "2026-11-23T09:00:00.000Z",
		sources: [...SAMPLE.sources, { ...SAMPLE.sources[0]!, id: "S99", publisher: "Off-topic Sports", title: "Match report" }],
	}) as Brief;

/** A scratch copy of the three files the script edits. */
function scratchRepo() {
	const dir = mkdtempSync(join(tmpdir(), "sample-export-"));
	for (const p of [PATHS.registry, PATHS.previews, join(PATHS.samples, "sudan-2026-11-16.json")]) {
		mkdirSync(dirname(join(dir, p)), { recursive: true });
		cpSync(join(ROOT, p), join(dir, p));
	}
	return dir;
}
const dirs: string[] = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("sample export", () => {
	it("names a sample by country and UTC date", () => {
		assert.equal(sampleSlug(SAMPLE), "sudan-2026-11-16");
		assert.equal(sampleSlug({ generatedAt: "2026-12-01T23:59:00Z", location: { country: "Côte d'Ivoire" } } as Brief), "cote-d-ivoire-2026-12-01");
	});

	it("finds sources no claim cites, and refuses to drop one that is cited", () => {
		assert.deepEqual(uncitedSources(withExtra()).map((s) => s.id).includes("S99"), true);
		const cited = SAMPLE.keyFacts[0]!.sourceIds[0]!;
		assert.throws(() => prepareSample(withExtra(), [cited]), /a claim cites it/);
		assert.throws(() => prepareSample(withExtra(), ["S404"]), /No source S404/);
		const ready = prepareSample(withExtra(), ["S99"]);
		assert.equal(ready.sources.some((s) => s.id === "S99"), false);
		assert.equal(ready.link?.durable, true);
	});

	it("writes the sample, its card entry and its preview, and never overwrites", () => {
		const dir = scratchRepo();
		dirs.push(dir);
		const { slug, uncited } = writeSample(withExtra(), ["S99"], dir, "2026-11-23");
		assert.equal(slug, "sudan-2026-11-23");
		// On-topic sources no claim cites stay listed for review; the dropped one is gone.
		assert.deepEqual(uncited.map((s) => s.id), uncitedSources(SAMPLE).map((s) => s.id));
		const written = JSON.parse(readFileSync(join(dir, PATHS.samples, `${slug}.json`), "utf8")) as Brief;
		assert.equal(written.sources.length, SAMPLE.sources.length);
		const registry = readFileSync(join(dir, PATHS.registry), "utf8");
		assert.match(registry, /slug: "sudan-2026-11-23",[\s\S]*removedSources: \["S99"\][\s\S]*import\("\.\/sudan-2026-11-23\.json"\)/);
		assert.ok(registry.indexOf("sudan-2026-11-23") < registry.indexOf('slug: "sudan-2026-11-16"'), "newest entry goes first");
		assert.match(readFileSync(join(dir, PATHS.previews), "utf8"), /"sudan-2026-11-23": \{\n\t\t"id": "dgUvNi4N3nPj",\n\t\t"sample": "sudan-2026-11-23"/);
		assert.throws(() => writeSample(withExtra(), ["S99"], dir), /already exists/);
	});

	it("re-exporting the published sample reproduces its file byte for byte", () => {
		const dir = scratchRepo();
		dirs.push(dir);
		const published = readFileSync(join(dir, PATHS.samples, "sudan-2026-11-16.json"), "utf8");
		rmSync(join(dir, PATHS.samples, "sudan-2026-11-16.json"));
		writeSample(SAMPLE, [], dir);
		assert.equal(readFileSync(join(dir, PATHS.samples, "sudan-2026-11-16.json"), "utf8"), published);
	});

	it("rejects a brief that doesn't match the API contract", () => {
		const dir = scratchRepo();
		dirs.push(dir);
		assert.throws(() => writeSample({ ...SAMPLE, headline: 42 }, [], dir), /API contract[\s\S]*headline/);
	});

	it("reads a topic or a brief id from the command line", () => {
		assert.deepEqual(parseArgs(["Sudan", "aid"]).topic, "Sudan aid");
		const a = parseArgs(["--brief", "abc123defg", "--drop", "S1, S4"]);
		assert.equal(a.brief, "abc123defg");
		assert.deepEqual(a.drop, ["S1", "S4"]);
		assert.throws(() => parseArgs([]), /Give a topic/);
	});
});
