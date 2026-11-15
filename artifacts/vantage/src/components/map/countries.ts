import { feature, neighbors } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { Feature, MultiPolygon, Polygon } from "geojson";

/**
 * Country outlines and borders from Natural Earth (1:110m, via world-atlas).
 * They give a reader who does not know the region its shape and neighbours,
 * and they come from map data, not from the model.
 */

export type CountryShape = Feature<Polygon | MultiPolygon, { name: string }>;

export type Country = {
	/** The name in the map data, e.g. "S. Sudan". */
	key: string;
	/** The name a reader expects, e.g. "South Sudan". */
	name: string;
	/** Whether the name reads with "the" in a sentence ("the Central African Republic"). */
	the: boolean;
	shape: CountryShape;
};

export type CountryIndex = {
	/** The country a free-text name refers to, or null when it names no country. */
	find(name: string | null | undefined): Country | null;
	/** Countries sharing a land border, in the map data's order. */
	neighbours(country: Country): Country[];
};

/** Map-data abbreviations, spelled out. */
const DISPLAY: Record<string, string> = {
	"S. Sudan": "South Sudan",
	"Central African Rep.": "Central African Republic",
	"Dem. Rep. Congo": "Democratic Republic of the Congo",
	Congo: "Republic of the Congo",
	"Eq. Guinea": "Equatorial Guinea",
	"W. Sahara": "Western Sahara",
	"Bosnia and Herz.": "Bosnia and Herzegovina",
	"Dominican Rep.": "Dominican Republic",
	"Solomon Is.": "Solomon Islands",
	"Falkland Is.": "Falkland Islands",
	"United States of America": "United States",
	"N. Cyprus": "Northern Cyprus",
	"Fr. S. Antarctic Lands": "French Southern and Antarctic Lands",
	Macedonia: "North Macedonia",
	eSwatini: "Eswatini",
};

/** Countries whose name takes "the" in running text. */
const WITH_THE = new Set([
	"United States",
	"United Kingdom",
	"Central African Republic",
	"Democratic Republic of the Congo",
	"Republic of the Congo",
	"Dominican Republic",
	"Netherlands",
	"Philippines",
	"Gambia",
	"Bahamas",
	"United Arab Emirates",
	"Solomon Islands",
	"Falkland Islands",
	"French Southern and Antarctic Lands",
]);

/** Other names readers and models use for a country, keyed to the map data's name. */
const ALIASES: Record<string, string> = {
	usa: "United States of America",
	us: "United States of America",
	america: "United States of America",
	uk: "United Kingdom",
	britain: "United Kingdom",
	"great britain": "United Kingdom",
	drc: "Dem. Rep. Congo",
	"dr congo": "Dem. Rep. Congo",
	"congo kinshasa": "Dem. Rep. Congo",
	"democratic republic of congo": "Dem. Rep. Congo",
	"congo brazzaville": "Congo",
	car: "Central African Rep.",
	"ivory coast": "Côte d'Ivoire",
	"cote d'ivoire": "Côte d'Ivoire",
	burma: "Myanmar",
	"czech republic": "Czechia",
	turkiye: "Turkey",
	swaziland: "eSwatini",
	"east timor": "Timor-Leste",
	uae: "United Arab Emirates",
	gaza: "Palestine",
	"gaza strip": "Palestine",
	"west bank": "Palestine",
	"state of palestine": "Palestine",
	"palestinian territories": "Palestine",
	"occupied palestinian territories": "Palestine",
	"occupied palestinian territory": "Palestine",
	"north korea": "North Korea",
	dprk: "North Korea",
	"south korea": "South Korea",
	"republic of korea": "South Korea",
	"russian federation": "Russia",
	"syrian arab republic": "Syria",
	"islamic republic of iran": "Iran",
};

/** Lower case, no accents, no leading "the", single spaces. */
export function normalise(name: string): string {
	return name
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[-–—]/g, " ")
		.replace(/[^a-z' ]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^the /, "");
}

export function buildCountryIndex(topology: Topology): CountryIndex {
	const collection = topology.objects["countries"] as GeometryCollection<{ name: string }>;
	const countries: Country[] = collection.geometries.map((geometry) => {
		const key = (geometry.properties as { name?: string } | null)?.name ?? "";
		const name = DISPLAY[key] ?? key;
		return {
			key,
			name,
			the: WITH_THE.has(name),
			shape: feature(topology, geometry) as unknown as CountryShape,
		};
	});
	const adjacency = neighbors(collection.geometries);

	const byName = new Map<string, Country>();
	countries.forEach((c) => {
		byName.set(normalise(c.key), c);
		byName.set(normalise(c.name), c);
	});
	for (const [alias, key] of Object.entries(ALIASES)) {
		const country = byName.get(normalise(key));
		if (country) byName.set(normalise(alias), country);
	}

	return {
		find(name) {
			if (!name) return null;
			return byName.get(normalise(name)) ?? null;
		},
		neighbours(country) {
			const i = countries.indexOf(country);
			return i < 0 ? [] : (adjacency[i] ?? []).map((j) => countries[j]).filter(Boolean);
		},
	};
}

/**
 * Where to write a country's name: the middle of its largest piece of land,
 * so a label sits on the mainland and an island or exclave does not drag it
 * out to sea. Returns [lat, lng].
 */
export function labelPoint(shape: CountryShape): [number, number] {
	const polygons = shape.geometry.type === "Polygon" ? [shape.geometry.coordinates] : shape.geometry.coordinates;
	let best: [number, number] = [0, 0];
	let bestArea = -1;
	for (const polygon of polygons) {
		const ring = polygon[0] ?? [];
		const lngs = ring.map((p) => p[0]);
		const lats = ring.map((p) => p[1]);
		const [w, e, s, n] = [Math.min(...lngs), Math.max(...lngs), Math.min(...lats), Math.max(...lats)];
		const area = (e - w) * (n - s);
		if (area > bestArea) {
			bestArea = area;
			best = [(s + n) / 2, (w + e) / 2];
		}
	}
	return best;
}

/** "the Central African Republic", "Chad". */
export function inSentence(country: Country): string {
	return country.the ? `the ${country.name}` : country.name;
}

/** "Egypt", "Egypt and Libya", "Egypt, Libya and Chad". */
export function listNames(names: string[]): string {
	if (names.length <= 1) return names.join("");
	return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * One or two plain sentences that tell a reader where a country is: the region
 * the brief names, and the neighbours on the map.
 */
export function describeWhere(country: Country, region: string | null | undefined, neighbours: Country[]): string {
	const subject = country.the ? `The ${country.name}` : country.name;
	const place = region?.trim();
	const borders =
		neighbours.length > 0
			? `shares land borders with ${listNames(neighbours.map(inSentence))}.`
			: "has no land borders with another country.";
	return place ? `${subject} is in ${place}. It ${borders}` : `${subject} ${borders}`;
}

let loading: Promise<CountryIndex> | null = null;

/** The outlines load once, on demand, so the home page never downloads them. */
export function loadCountries(): Promise<CountryIndex> {
	loading ??= import("world-atlas/countries-110m.json").then((m) =>
		buildCountryIndex(m.default as unknown as Topology),
	);
	// A failed download can be retried on the next brief.
	loading.catch(() => {
		loading = null;
	});
	return loading;
}
