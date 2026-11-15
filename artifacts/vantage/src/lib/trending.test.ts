import { describe, expect, it } from "vitest";
import type { TrendingResponse, TrendingTopic } from "@workspace/api-client-react";
import { cardLabel, homeTopics, isReady, QUICK_TOPICS, timeAgo, todayCaption, todayHref } from "./trending";

const NOW = Date.parse("2026-11-14T12:00:00Z");
const topic = (overrides: Partial<TrendingTopic> = {}): TrendingTopic => ({
	label: "Sudan",
	country: "Sudan",
	outletCount: 7,
	newestAt: new Date(NOW - 3 * 3_600_000).toISOString(),
	headline: { title: "Sudan: aid trucks attacked", publisher: "Al Jazeera", url: "https://example.org/a" },
	briefId: null,
	...overrides,
});
const response = (topics: TrendingTopic[]): TrendingResponse => ({ updatedAt: new Date(NOW).toISOString(), windowHours: 24, outletCount: 23, topics });

describe("what the home page offers", () => {
	it("shows today's topics when the API has some", () => {
		expect(homeTopics({ status: "success", data: response([topic()]) })).toEqual({ kind: "today", topics: [topic()], outletCount: 23 });
	});

	it("falls back to the example topics when the ranking is empty", () => {
		expect(homeTopics({ status: "success", data: response([]) })).toEqual({ kind: "examples", topics: QUICK_TOPICS });
	});

	it("falls back to the example topics when the request fails", () => {
		expect(homeTopics({ status: "error" })).toEqual({ kind: "examples", topics: QUICK_TOPICS });
	});

	it("waits, showing neither, while the request is in flight", () => {
		expect(homeTopics({ status: "pending" })).toEqual({ kind: "loading" });
	});
});

describe("a Today card", () => {
	it("opens the topic's brief page whether or not the brief is ready, so it cannot lead to an expired link", () => {
		expect(todayHref(topic())).toBe("/analysis?topic=Sudan");
		expect(todayHref(topic({ label: "DR Congo", briefId: "abcdefghijkl" }))).toBe("/analysis?topic=DR%20Congo");
	});

	it("is ready only with a brief id", () => {
		expect(isReady(topic())).toBe(false);
		expect(isReady(topic({ briefId: "abcdefghijkl" }))).toBe(true);
	});

	it("says everything it shows to a screen reader", () => {
		expect(cardLabel(topic(), NOW)).toBe("Sudan. 7 outlets, newest 3 h ago: Sudan: aid trucks attacked. Brief takes about a minute.");
		expect(cardLabel(topic({ label: "Gaza", country: "Palestinian territories", briefId: "abcdefghijkl" }), NOW)).toBe(
			"Gaza, Palestinian territories. 7 outlets, newest 3 h ago: Sudan: aid trucks attacked. Brief ready.",
		);
	});
});

describe("labels", () => {
	it("say honestly what was counted", () => {
		expect(todayCaption(23)).toBe("Most covered in the last 24 hours across 23 outlets we read");
		expect(todayCaption(1)).toBe("Most covered in the last 24 hours across 1 outlet we read");
	});

	it("give the age of the newest headline in words", () => {
		expect(timeAgo(new Date(NOW - 30_000).toISOString(), NOW)).toBe("just now");
		expect(timeAgo(new Date(NOW - 25 * 60_000).toISOString(), NOW)).toBe("25 min ago");
		expect(timeAgo(new Date(NOW - 5 * 3_600_000).toISOString(), NOW)).toBe("5 h ago");
		// A clock slightly ahead of ours is not "in the future".
		expect(timeAgo(new Date(NOW + 60_000).toISOString(), NOW)).toBe("just now");
	});
});
