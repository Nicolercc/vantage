import { describe, expect, it } from "vitest";
import { isConflictBrief, moduleSections, showsMap } from "./brief-kind";

const place = { city: "", country: "", region: "", lat: null, lng: null };
const event = { date: "Nov 2026", title: "t", description: "d", type: "incident" as const, place: null, lat: null, lng: null, searchQuery: "q" };

describe("what kind of brief this is", () => {
	it("treats a brief saved before topic types as a conflict brief", () => {
		expect(isConflictBrief({})).toBe(true);
		expect(isConflictBrief({ topicType: "conflict" })).toBe(true);
		expect(isConflictBrief({ topicType: "technology" })).toBe(false);
	});

	it("always maps a conflict, and other news only with a confirmed place", () => {
		expect(showsMap({ location: place, relatedEvents: [] })).toBe(true);
		expect(showsMap({ topicType: "technology", location: place, relatedEvents: [event] })).toBe(false);
		expect(showsMap({ topicType: "disaster", location: { ...place, lat: 1, lng: 2 }, relatedEvents: [] })).toBe(true);
		expect(showsMap({ topicType: "politics", location: place, relatedEvents: [{ ...event, lat: 1, lng: 2 }] })).toBe(true);
	});

	it("lists only the modules a brief has, outage first", () => {
		expect(moduleSections({})).toEqual([]);
		expect(moduleSections({ modules: null })).toEqual([]);
		const sections = moduleSections({
			modules: {
				business: { companies: ["An airline"], marketEffect: [] },
				disaster: null,
				outage: { servicesAffected: ["Booking"], status: [] },
			},
		});
		expect(sections.map((s) => [s.id, s.names])).toEqual([
			["outage", ["Booking"]],
			["business", ["An airline"]],
		]);
	});
});
