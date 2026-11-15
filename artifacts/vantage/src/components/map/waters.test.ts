import { describe, expect, it } from "vitest";
import type { Topology } from "topojson-specification";
import world from "world-atlas/countries-110m.json";
import { buildCountryIndex } from "./countries";
import { findWater, scanForWater, WATERS } from "./waters";

describe("findWater", () => {
	it("finds a water by name, alias or spelling, in any part of the place", () => {
		expect(findWater("Strait of Hormuz")?.name).toBe("Strait of Hormuz");
		expect(findWater("Bab-el-Mandeb")?.name).toBe("Bab al-Mandab");
		expect(findWater("the Red Sea")?.name).toBe("Red Sea");
		expect(findWater("Red Sea, off Yemen")?.name).toBe("Red Sea");
		expect(findWater("Strait of Hormuz and the Gulf of Oman")?.name).toBe("Strait of Hormuz");
		expect(findWater("Arabian Gulf")?.name).toBe("Persian Gulf");
	});

	it("does not treat a city or country as water", () => {
		expect(findWater("Khartoum, Sudan")).toBeNull();
		expect(findWater("Yemen")).toBeNull();
		expect(findWater(null)).toBeNull();
	});
});

describe("scanForWater", () => {
	it("finds the water a search topic names, preferring the longest name", () => {
		expect(scanForWater("Red Sea shipping tensions")?.name).toBe("Red Sea");
		expect(scanForWater("Eastern Mediterranean gas dispute")?.name).toBe("Eastern Mediterranean");
		expect(scanForWater("Houthi attacks in the Gulf of Aden")?.name).toBe("Gulf of Aden");
		expect(scanForWater("Sudan humanitarian access")).toBeNull();
	});
});

describe("the list of waters", () => {
	const index = buildCountryIndex(world as unknown as Topology);

	it("names only countries the map knows on each coast", () => {
		const missing = WATERS.flatMap((w) => w.coast.filter((c) => !index.find(c)).map((c) => `${w.name}: ${c}`));
		expect(missing).toEqual([]);
	});

	it("puts every point on the globe", () => {
		for (const w of WATERS) {
			expect(Math.abs(w.at[0])).toBeLessThanOrEqual(90);
			expect(Math.abs(w.at[1])).toBeLessThanOrEqual(180);
		}
	});
});
