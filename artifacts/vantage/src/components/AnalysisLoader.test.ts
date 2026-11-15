import { describe, expect, it } from "vitest";
import { freshness, requestLabel } from "./analysis-loader-format";

describe("requestLabel", () => {
	it("keeps the reader's topic", () => {
		expect(requestLabel({ kind: "topic", topic: "Red Sea shipping tensions" }))
			.toBe("Red Sea shipping tensions");
	});

	it("uses the host for a link", () => {
		expect(requestLabel({ kind: "url", url: "https://www.example.com/news" }))
			.toBe("An article from example.com");
	});

	it("uses a generic label for pasted text or an invalid link", () => {
		expect(requestLabel({ kind: "article", text: "Article text" })).toBe("Your article");
		expect(requestLabel({ kind: "url", url: "invalid" })).toBe("Your article");
	});
});

describe("freshness", () => {
	const now = Date.parse("2026-11-14T18:00:00Z");

	it.each([
		[null, null],
		["invalid", null],
		["2026-11-14T17:30:00Z", "within the hour"],
		["2026-11-14T17:00:00Z", "1 hour ago"],
		["2026-11-14T15:30:00Z", "2 hours ago"],
		["2026-11-13T18:00:00Z", "1 day ago"],
		["2026-11-11T18:00:00Z", "3 days ago"],
	] as const)("formats %s as %s", (timestamp, label) => {
		expect(freshness(timestamp, now)).toBe(label);
	});
});
