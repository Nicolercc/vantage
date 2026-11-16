import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Claim, Source } from "@workspace/api-client-react";
import { ClaimList, SourceBody, pickQuote } from "./Evidence";

const source = (id: string, over: Partial<Source> = {}): Source =>
	({
		id,
		kind: "news",
		provider: "Feed",
		publisher: `Outlet ${id}`,
		title: `Headline ${id}`,
		url: `https://example.org/${id}`,
		publishedAt: "2026-11-13T06:05:42Z",
		retrievedAt: "2026-11-16T04:00:00Z",
		language: "English",
		country: null,
		excerpt: null,
		...over,
	}) as Source;
const claim = (text: string, ids: string[], quotes: Record<string, string>, support: Claim["support"] = "verified"): Claim =>
	({ text, sourceIds: ids, evidence: ids.map((sourceId) => ({ sourceId, quote: quotes[sourceId] ?? "" })), support }) as Claim;
const sources = [source("S1"), source("S2"), source("S3", { url: null })];
const toggles = (html: string) => (html.match(/class="ci-quote__toggle"/g) ?? []).length;

describe("pickQuote", () => {
	it("uses the first cited source that has quoted words", () => {
		expect(pickQuote(claim("x", ["S1", "S2"], { S2: "the words" }), sources)).toEqual({ source: sources[1], quote: "the words" });
	});

	it("offers nothing for a claim the second check didn't verify", () => {
		expect(pickQuote(claim("x", ["S1"], { S1: "words" }, "unverified"), sources)).toBeNull();
	});

	it("offers nothing without quoted words or a known source", () => {
		expect(pickQuote(claim("x", ["S1"], { S1: "   " }), sources)).toBeNull();
		expect(pickQuote(claim("x", ["S9"], { S9: "words" }), sources)).toBeNull();
	});
});

describe("See source quote on the key facts", () => {
	it("appears once, on the first verified claim with a quote", () => {
		const html = renderToStaticMarkup(
			createElement(ClaimList, {
				claims: [claim("unchecked", ["S1"], { S1: "a" }, "unverified"), claim("checked", ["S2"], { S2: "b" }), claim("also", ["S1"], { S1: "c" })],
				sources,
				empty: "none",
				showQuoteFor: "first-verified",
			}),
		);
		expect(toggles(html)).toBe(1);
		expect(html.indexOf("ci-quote__toggle")).toBeGreaterThan(html.indexOf("checked"));
		expect(html).toContain('aria-expanded="false"');
		expect(html).toMatch(/role="region"[^>]*hidden=""/);
	});

	it("does not appear on lists that don't opt in, or when no claim qualifies", () => {
		const claims = [claim("checked", ["S2"], { S2: "b" })];
		expect(toggles(renderToStaticMarkup(createElement(ClaimList, { claims, sources, empty: "none" })))).toBe(0);
		const none = [claim("x", ["S1"], { S1: "" })];
		expect(toggles(renderToStaticMarkup(createElement(ClaimList, { claims: none, sources, empty: "none", showQuoteFor: "first-verified" })))).toBe(0);
	});
});

describe("SourceBody", () => {
	it("names the outlet on the way to the original, opening a new tab", () => {
		const html = renderToStaticMarkup(createElement(SourceBody, { source: sources[0], quote: "the words" }));
		expect(html).toContain("Read the original on Outlet S1");
		expect(html).toContain('target="_blank"');
		expect(html).toContain('rel="noopener noreferrer"');
		expect(html).toContain("the words");
	});

	it("says so plainly when the original isn't online", () => {
		const html = renderToStaticMarkup(createElement(SourceBody, { source: sources[2], quote: "words" }));
		expect(html).toContain("Original not available online");
		expect(html).not.toContain("Read the original");
	});
});
