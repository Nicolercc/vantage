import { describe, expect, it } from "vitest";
import type { Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import { buildCountryIndex, describeWhere, labelPoint, listNames, normalise, regionInSentence } from "./countries";

const index = buildCountryIndex(world as unknown as Topology);

describe("country lookup", () => {
	it("finds a country by its common name, an abbreviation or another spelling", () => {
		expect(index.find("Sudan")?.name).toBe("Sudan");
		expect(index.find("South Sudan")?.name).toBe("South Sudan");
		expect(index.find("DRC")?.name).toBe("Democratic Republic of the Congo");
		expect(index.find("the United States")?.name).toBe("United States");
		expect(index.find("Türkiye")?.name).toBe("Turkey");
		expect(index.find("Ivory Coast")?.name).toBe("Côte d'Ivoire");
		expect(index.find("Gaza Strip")?.name).toBe("Palestine");
	});

	it("does not treat a city, a region or nothing as a country", () => {
		expect(index.find("Khartoum")).toBeNull();
		expect(index.find("North Darfur, Sudan")).toBeNull();
		expect(index.find("")).toBeNull();
		expect(index.find(null)).toBeNull();
	});

	it("keeps South Sudan and Sudan apart", () => {
		expect(index.find("Sudan")).not.toBe(index.find("South Sudan"));
	});
});

describe("neighbours", () => {
	it("lists the countries that share a land border", () => {
		const sudan = index.find("Sudan")!;
		const names = index.neighbours(sudan).map((c) => c.name).sort();
		expect(names).toEqual(
			["Central African Republic", "Chad", "Egypt", "Eritrea", "Ethiopia", "Libya", "South Sudan"].sort(),
		);
	});

	it("is empty for an island country", () => {
		expect(index.neighbours(index.find("Iceland")!)).toEqual([]);
	});
});

describe("describeWhere", () => {
	const sudan = index.find("Sudan")!;
	const chad = index.find("Chad")!;
	const car = index.find("Central African Republic")!;

	it("names the region and every neighbour, with 'the' where English needs it", () => {
		expect(describeWhere(sudan, "East Africa", [chad, car])).toBe(
			"Sudan is in East Africa. It shares land borders with Chad and the Central African Republic.",
		);
	});

	it("still says where the borders are when the region is unknown", () => {
		expect(describeWhere(car, null, [chad])).toBe("The Central African Republic shares land borders with Chad.");
	});

	it("says when a country has no land border", () => {
		expect(describeWhere(index.find("Iceland")!, "Northern Europe", [])).toBe(
			"Iceland is in Northern Europe. It has no land borders with another country.",
		);
	});
});

describe("text helpers", () => {
	it("joins names the way a sentence does", () => {
		expect(listNames(["Egypt"])).toBe("Egypt");
		expect(listNames(["Egypt", "Libya", "Chad"])).toBe("Egypt, Libya and Chad");
	});

	it("ignores case, accents and a leading 'the'", () => {
		expect(normalise("  The Côte-d'Ivoire ")).toBe("cote d'ivoire");
	});
});

describe("labelPoint", () => {
	it("puts a country's name inside the country", () => {
		const [lat, lng] = labelPoint(index.find("Egypt")!.shape);
		expect(lat).toBeGreaterThan(22);
		expect(lat).toBeLessThan(32);
		expect(lng).toBeGreaterThan(25);
		expect(lng).toBeLessThan(35);
	});

	it("uses the largest piece of a country made of several", () => {
		// The United States: the lower 48 states, not Alaska or Hawaii.
		const [lat, lng] = labelPoint(index.find("United States")!.shape);
		expect(lat).toBeGreaterThan(30);
		expect(lat).toBeLessThan(45);
		expect(lng).toBeGreaterThan(-110);
		expect(lng).toBeLessThan(-85);
	});
});

describe("regionInSentence", () => {
	it("adds 'the' where English needs it, and only there", () => {
		expect(regionInSentence("Middle East")).toBe("the Middle East");
		expect(regionInSentence("Horn of Africa")).toBe("the Horn of Africa");
		expect(regionInSentence("The Sahel")).toBe("the Sahel");
		expect(regionInSentence("East Africa")).toBe("East Africa");
		expect(regionInSentence("Southeast Asia")).toBe("Southeast Asia");
	});

	it("reads correctly in the sentence above the map", () => {
		const yemen = index.find("Yemen")!;
		expect(describeWhere(yemen, "Middle East", index.neighbours(yemen))).toBe(
			"Yemen is in the Middle East. It shares land borders with Oman and Saudi Arabia.",
		);
	});
});
