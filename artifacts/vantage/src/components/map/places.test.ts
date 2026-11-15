import { describe, expect, it } from "vitest";
import type { Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import { buildCountryIndex } from "./countries";
import { countryWideLabel, eventPoint, mapPlaces, onWaterLabel } from "./places";

const index = buildCountryIndex(world as unknown as Topology);

type Brief = Parameters<typeof mapPlaces>[0];
const event = (place: string | null, lat: number | null = null, lng: number | null = null) =>
	({ date: "2026", title: "t", description: "d", type: "humanitarian", place, lat, lng }) as Brief["relatedEvents"][number];
const brief = (events: Brief["relatedEvents"], hub: { lat: number | null; lng: number | null } = { lat: 15.56, lng: 32.53 }): Brief =>
	({ location: { city: "Khartoum", country: "Sudan", region: "East Africa", ...hub }, relatedEvents: events }) as Brief;

describe("mapPlaces", () => {
	it("shades the brief's country and counts events that name it as covered, not unknown", () => {
		const places = mapPlaces(brief([event("Sudan"), event("Sudan"), event("Sudan")]), index);
		expect(places.focus?.name).toBe("Sudan");
		expect(places).toMatchObject({ others: [], countryWide: 3, unknown: 0 });
		expect(countryWideLabel(places)).toBe(
			"3 timeline events cover all of Sudan, so they are shown by the shading, not a pin",
		);
	});

	it("shades another named country more lightly, once", () => {
		const places = mapPlaces(brief([event("Chad"), event("Chad"), event("Sudan")]), index);
		expect(places.others.map((c) => c.name)).toEqual(["Chad"]);
		expect(countryWideLabel(places)).toBe(
			"3 timeline events cover a whole country, so they are shown by the shading, not a pin",
		);
	});

	it("leaves pinned events alone and still reports places it cannot draw", () => {
		const places = mapPlaces(brief([event("El Fasher, Sudan", 13.6, 25.3), event("North Darfur, Sudan"), event(null)]), index);
		expect(places).toMatchObject({ countryWide: 0, unknown: 2 });
		expect(countryWideLabel(places)).toBeNull();
	});

	it("does not call the main place unknown when its country is shaded", () => {
		expect(mapPlaces(brief([], { lat: null, lng: null }), index).unknown).toBe(0);
	});

	it("works before the outlines have loaded", () => {
		expect(mapPlaces(brief([event("Sudan")], { lat: null, lng: null }), null)).toEqual({
			focus: null,
			others: [],
			countryWide: 0,
			waters: [],
			onWater: 0,
			unknown: 2,
		});
	});
});

describe("seas and straits", () => {
	it("pins an event on the water it names instead of calling it unknown", () => {
		const places = mapPlaces(brief([event("Strait of Hormuz"), event("Red Sea, off Yemen"), event("Bab el-Mandeb")]), index);
		expect(places).toMatchObject({ onWater: 3, unknown: 0, countryWide: 0 });
		expect(places.waters.map((w) => w.name)).toEqual(["Strait of Hormuz", "Red Sea", "Bab al-Mandab"]);
		expect(onWaterLabel(places)).toBe("3 timeline events are pinned on the sea or strait they name");
	});

	it("keeps a geocoder's confirmed point over the list of waters", () => {
		expect(eventPoint(event("Red Sea", 15.6, 32.5))).toEqual({ at: [15.6, 32.5], water: null });
		expect(eventPoint(event("Red Sea"))?.water?.name).toBe("Red Sea");
		expect(eventPoint(event("Khartoum, Sudan"))).toBeNull();
	});
});
