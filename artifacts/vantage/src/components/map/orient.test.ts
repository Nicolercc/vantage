import { describe, expect, it } from "vitest";
import type { Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import { buildCountryIndex } from "./countries";
import { describeTextPlace, describeWater, placeFromText } from "./orient";
import { findWater } from "./waters";

const index = buildCountryIndex(world as unknown as Topology);
const where = (text: string) => {
	const p = placeFromText(text, index);
	return { country: p.country?.name ?? null, water: p.water?.name ?? null };
};

describe("placeFromText", () => {
	it("reads the country or sea a search is about", () => {
		expect(where("Sudan humanitarian access")).toEqual({ country: "Sudan", water: null });
		expect(where("South Sudan floods")).toEqual({ country: "South Sudan", water: null });
		expect(where("Ukraine front-line updates")).toEqual({ country: "Ukraine", water: null });
		expect(where("Gaza ceasefire reporting")).toEqual({ country: "Palestine", water: null });
		expect(where("Red Sea shipping tensions")).toEqual({ country: null, water: "Red Sea" });
		expect(where("Houthi attacks in the Red Sea")).toEqual({ country: "Yemen", water: "Red Sea" });
		expect(where("Fighting in Darfur")).toEqual({ country: "Sudan", water: null });
	});

	it("does not read ordinary words as countries", () => {
		expect(where("car bomb kills 12, officials tell us")).toEqual({ country: null, water: null });
		expect(where("Niger coup")).toEqual({ country: "Niger", water: null });
		expect(where("Nigeria elections")).toEqual({ country: "Nigeria", water: null });
	});

	it("finds nothing before the outlines load", () => {
		expect(placeFromText("Sudan", null).country).toBeNull();
	});
});

describe("describeTextPlace", () => {
	it("places a sea between the countries on its shores", () => {
		expect(describeWater(findWater("Strait of Hormuz")!, index)).toBe(
			"The Strait of Hormuz lies between Iran, Oman and the United Arab Emirates.",
		);
		expect(describeTextPlace(placeFromText("Houthi attacks in the Red Sea", index), index)).toBe(
			"The Red Sea lies between Egypt, Sudan, Eritrea, Djibouti, Yemen and Saudi Arabia.",
		);
	});

	it("names a country's neighbours", () => {
		expect(describeTextPlace(placeFromText("Yemen", index), index)).toBe(
			"Yemen shares land borders with Oman and Saudi Arabia.",
		);
	});

	it("says nothing when the search names no place", () => {
		expect(describeTextPlace(placeFromText("drone warfare", index), index)).toBeNull();
	});
});
