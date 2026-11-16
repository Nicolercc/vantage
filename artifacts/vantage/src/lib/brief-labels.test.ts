import { describe, expect, it } from "vitest";
import type { IntelligenceBrief } from "@workspace/api-client-react";
import { newsCount, reportUrl, sourceBreakdown } from "./brief-labels";

const brief = { id: "dgUvNi4N3nPj", headline: "Sudan's crisis deepens", generatedAt: "2026-11-16T04:00:35.708Z" } as IntelligenceBrief;
const reportedPage = (url: string) => decodeURIComponent(new URL(url).searchParams.get("body") ?? "").split("\n")[0];

describe("reportUrl", () => {
	it("names the page the reader is on, so a sample report opens the sample", () => {
		expect(reportedPage(reportUrl(brief, "https://vantage.example/sample/sudan-2026-11-16"))).toBe(
			"Brief: https://vantage.example/sample/sudan-2026-11-16",
		);
	});

	it("names a saved brief by its own address", () => {
		expect(reportedPage(reportUrl(brief, "https://vantage.example/brief/dgUvNi4N3nPj"))).toBe(
			"Brief: https://vantage.example/brief/dgUvNi4N3nPj",
		);
	});
});

describe("counts say what they count", () => {
	it("calls retrieved news reports news reports", () => {
		expect(newsCount(10, 8)).toBe("10 news reports from 8 outlets");
		expect(newsCount(1, 1)).toBe("1 news report from 1 outlet");
		expect(newsCount(0, 0)).toBe("0 news reports");
	});

	it("splits the sources count into news and background", () => {
		const kinds = (...k: string[]) => ({ sources: k.map((kind) => ({ kind })) }) as unknown as IntelligenceBrief;
		expect(sourceBreakdown(kinds("news", "news", "reference"))).toBe("2 news reports + 1 background reference");
		expect(sourceBreakdown(kinds("news"))).toBe("1 news report");
	});
});
