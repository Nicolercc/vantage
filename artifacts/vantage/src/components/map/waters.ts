import { normalise } from "./countries";

/**
 * Seas, straits, gulfs and lakes that conflicts are reported around. The
 * geocoder will not pin these reliably (a sea's centre can be hundreds of
 * kilometres from a model's guess), so the map places them from this list.
 * Points sit on the water, near where shipping and reporting concentrate; the
 * coast lists use the country names the map data uses.
 */
export type Water = {
	name: string;
	aliases: string[];
	/** [lat, lng] */
	at: [number, number];
	/** Countries on its shores, for the sentence that places it. */
	coast: string[];
};

export const WATERS: Water[] = [
	{ name: "Red Sea", aliases: [], at: [20.0, 38.5], coast: ["Egypt", "Sudan", "Eritrea", "Djibouti", "Yemen", "Saudi Arabia"] },
	{ name: "Strait of Hormuz", aliases: ["hormuz", "hormuz strait"], at: [26.57, 56.25], coast: ["Iran", "Oman", "United Arab Emirates"] },
	{
		name: "Bab al-Mandab",
		aliases: ["bab el mandeb", "bab al mandab strait", "bab el mandeb strait", "bab al mandeb", "mandab strait"],
		at: [12.6, 43.35],
		coast: ["Yemen", "Djibouti", "Eritrea"],
	},
	{ name: "Gulf of Aden", aliases: [], at: [12.5, 47.5], coast: ["Yemen", "Somalia", "Djibouti"] },
	{ name: "Persian Gulf", aliases: ["arabian gulf", "the gulf"], at: [26.8, 51.5], coast: ["Iran", "Iraq", "Kuwait", "Saudi Arabia", "Qatar", "United Arab Emirates"] },
	{ name: "Gulf of Oman", aliases: [], at: [24.6, 58.6], coast: ["Oman", "Iran", "United Arab Emirates"] },
	{ name: "Arabian Sea", aliases: [], at: [16.0, 63.0], coast: ["Oman", "Yemen", "Pakistan", "India"] },
	{ name: "Suez Canal", aliases: ["suez"], at: [30.6, 32.33], coast: ["Egypt"] },
	{ name: "Black Sea", aliases: [], at: [43.2, 34.0], coast: ["Ukraine", "Russia", "Georgia", "Turkey", "Bulgaria", "Romania"] },
	{ name: "Sea of Azov", aliases: ["azov sea"], at: [46.1, 36.6], coast: ["Ukraine", "Russia"] },
	{ name: "Kerch Strait", aliases: ["strait of kerch"], at: [45.3, 36.55], coast: ["Ukraine", "Russia"] },
	{ name: "Bosphorus", aliases: ["bosporus", "bosphorus strait"], at: [41.12, 29.07], coast: ["Turkey"] },
	{ name: "Mediterranean Sea", aliases: ["mediterranean"], at: [35.0, 18.0], coast: [] },
	{ name: "Eastern Mediterranean", aliases: ["east mediterranean"], at: [33.8, 32.5], coast: ["Israel", "Lebanon", "Syria", "Cyprus", "Turkey", "Egypt"] },
	{ name: "Aegean Sea", aliases: ["aegean"], at: [39.0, 25.0], coast: ["Greece", "Turkey"] },
	{ name: "Adriatic Sea", aliases: ["adriatic"], at: [43.0, 15.5], coast: ["Italy", "Croatia", "Albania", "Montenegro", "Slovenia", "Bosnia and Herzegovina"] },
	{ name: "Strait of Gibraltar", aliases: ["gibraltar strait"], at: [35.95, -5.6], coast: ["Spain", "Morocco"] },
	{ name: "English Channel", aliases: [], at: [50.2, -1.5], coast: ["United Kingdom", "France"] },
	{ name: "Baltic Sea", aliases: ["baltic"], at: [57.5, 19.5], coast: ["Sweden", "Finland", "Estonia", "Latvia", "Lithuania", "Poland", "Germany", "Denmark", "Russia"] },
	{ name: "Caspian Sea", aliases: [], at: [41.5, 50.8], coast: ["Russia", "Kazakhstan", "Turkmenistan", "Iran", "Azerbaijan"] },
	{ name: "South China Sea", aliases: [], at: [12.0, 113.5], coast: ["China", "Vietnam", "Philippines", "Malaysia", "Brunei", "Indonesia", "Taiwan"] },
	{ name: "East China Sea", aliases: [], at: [29.0, 125.5], coast: ["China", "Taiwan", "Japan", "South Korea"] },
	{ name: "Taiwan Strait", aliases: ["formosa strait"], at: [24.2, 119.6], coast: ["China", "Taiwan"] },
	{ name: "Yellow Sea", aliases: [], at: [35.5, 123.5], coast: ["China", "North Korea", "South Korea"] },
	{ name: "Sea of Japan", aliases: ["east sea"], at: [40.0, 134.5], coast: ["Japan", "Russia", "North Korea", "South Korea"] },
	{ name: "Strait of Malacca", aliases: ["malacca strait"], at: [3.0, 100.9], coast: ["Malaysia", "Indonesia"] },
	{ name: "Gulf of Guinea", aliases: [], at: [2.0, 3.5], coast: ["Nigeria", "Cameroon", "Ghana", "Togo", "Benin", "Côte d'Ivoire", "Equatorial Guinea", "Gabon"] },
	{ name: "Mozambique Channel", aliases: [], at: [-18.0, 41.0], coast: ["Mozambique", "Madagascar"] },
	{ name: "Lake Chad", aliases: [], at: [13.1, 14.4], coast: ["Chad", "Niger", "Nigeria", "Cameroon"] },
	{ name: "Lake Kivu", aliases: [], at: [-2.0, 29.2], coast: ["Democratic Republic of the Congo", "Rwanda"] },
	{ name: "Lake Victoria", aliases: [], at: [-1.0, 33.0], coast: ["Uganda", "Kenya", "Tanzania"] },
	{ name: "Dead Sea", aliases: [], at: [31.5, 35.5], coast: ["Israel", "Jordan", "Palestine"] },
	{ name: "Gulf of Mexico", aliases: [], at: [25.0, -90.0], coast: ["United States", "Mexico", "Cuba"] },
	{ name: "Caribbean Sea", aliases: ["caribbean"], at: [15.0, -75.0], coast: [] },
];

const byName = new Map<string, Water>();
for (const water of WATERS) {
	for (const n of [water.name, ...water.aliases]) byName.set(normalise(n), water);
}
/** Longest names first, so "eastern mediterranean" wins over "mediterranean". */
const SCAN = [...byName.keys()].sort((a, b) => b.length - a.length);

/**
 * The water a place names, or null. Each part of the place is tried, so
 * "Red Sea, off Yemen" and "Strait of Hormuz and the Gulf of Oman" both
 * resolve (to the first water named).
 */
export function findWater(place: string | null | undefined): Water | null {
	if (!place) return null;
	for (const part of place.split(/,|;|\/|&|\band\b|\bnear\b|\boff\b/i)) {
		const water = byName.get(normalise(part));
		if (water) return water;
	}
	return null;
}

/** The first water named anywhere in free text, such as a search topic. */
export function scanForWater(text: string): Water | null {
	const t = ` ${normalise(text)} `;
	for (const name of SCAN) {
		if (t.includes(` ${name} `)) return byName.get(name) ?? null;
	}
	return null;
}
