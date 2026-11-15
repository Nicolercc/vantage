import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KindMark, ReadingKey } from "./SourceKind";
import { InThirtySeconds } from "./InThirtySeconds";

afterEach(() => vi.unstubAllGlobals());

describe("KindMark", () => {
	it("keeps the full label for screen readers and the tooltip, with only a small mark on screen", () => {
		const html = renderToStaticMarkup(createElement(KindMark, { kind: "sourced" }));
		expect(html).toContain('aria-hidden="true">✓');
		expect(html).toContain('class="sr-only">From retrieved reporting.');
		expect(html).toContain('title="From retrieved reporting: ');
	});
});

describe("ReadingKey", () => {
	it("explains all three marks once", () => {
		vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
		const html = renderToStaticMarkup(createElement(ReadingKey));
		for (const label of ["From news reports", "Background written by AI", "The original reporting"]) {
			expect(html).toContain(label);
		}
	});

	it("still shows when the browser blocks storage", () => {
		vi.stubGlobal("localStorage", {
			getItem: () => {
				throw new Error("blocked");
			},
		});
		expect(renderToStaticMarkup(createElement(ReadingKey))).toContain("How to read this brief");
	});

	it("stays hidden once dismissed in this browser", () => {
		vi.stubGlobal("localStorage", { getItem: () => "1" });
		expect(renderToStaticMarkup(createElement(ReadingKey))).toBe("");
	});
});

describe("InThirtySeconds", () => {
	const orientation = { inScope: true, what: "Two forces are fighting.", where: "Sudan.", who: "The army and the RSF.", whyItMatters: "Millions are hungry." };

	it("shows four labelled rows and makes defined terms tappable", () => {
		const html = renderToStaticMarkup(
			createElement(InThirtySeconds, { orientation, glossary: [{ term: "RSF", meaning: "A paramilitary group." }] }),
		);
		for (const label of ["What&#x27;s happening", "Where", "Who&#x27;s involved", "Why it matters"]) expect(html).toContain(label);
		expect(html).toContain('class="ci-term"');
		expect(html).toContain("Model background");
	});

	it("shows nothing when the topic is out of scope or there is no orientation", () => {
		expect(renderToStaticMarkup(createElement(InThirtySeconds, { orientation: { ...orientation, inScope: false } }))).toBe("");
		expect(renderToStaticMarkup(createElement(InThirtySeconds, { orientation: null }))).toBe("");
	});
});
