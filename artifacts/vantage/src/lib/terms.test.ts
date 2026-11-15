import { describe, expect, it } from "vitest";
import { splitTerms } from "./terms";

const glossary = [
	{ term: "RSF", meaning: "Rapid Support Forces, a paramilitary group." },
	{ term: "Rapid Support Forces", meaning: "A paramilitary group fighting the army." },
	{ term: "famine", meaning: "Extreme, widespread hunger." },
];
const terms = (segments: ReturnType<typeof splitTerms>) => segments.filter((s) => "term" in s).map((s) => s.text);

describe("splitTerms", () => {
	it("marks the first appearance of each term and keeps the text whole", () => {
		const text = "The Rapid Support Forces (RSF) took the town. The RSF denied it. Famine spreads.";
		const segments = splitTerms(text, glossary);
		expect(segments.map((s) => s.text).join("")).toBe(text);
		expect(terms(segments)).toEqual(["Rapid Support Forces", "RSF", "Famine"]);
	});

	it("matches an abbreviation only in capitals and only as a whole word", () => {
		expect(terms(splitTerms("The rsf and RSFs are not the RSF.", glossary))).toEqual(["RSF"]);
	});

	it("explains a term once across sections that share a set", () => {
		const used = new Set<string>();
		expect(terms(splitTerms("RSF fighters advanced.", glossary, used))).toEqual(["RSF"]);
		expect(terms(splitTerms("RSF fighters retreated.", glossary, used))).toEqual([]);
	});

	it("returns plain text when there is no glossary", () => {
		expect(splitTerms("Nothing to define.", null)).toEqual([{ text: "Nothing to define." }]);
	});
});
