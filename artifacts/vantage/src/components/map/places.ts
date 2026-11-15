import type { IntelligenceBrief } from "@workspace/api-client-react";
import type { Country, CountryIndex } from "./countries";

type Located = { lat: number | null; lng: number | null };
const isLocated = (p: Located) => typeof p.lat === "number" && typeof p.lng === "number";

export type MapPlaces = {
	/** The country the brief is about, shaded on the map. */
	focus: Country | null;
	/** Other countries an event names as a whole, shaded more lightly. */
	others: Country[];
	/** Events with no pin whose place is a whole country: shown by its shading. */
	countryWide: number;
	/** Places that are neither pinned nor shaded. */
	unknown: number;
};

/**
 * What the map can show for a brief beyond its pins. A place that is a whole
 * country ("Sudan") has no point to pin, but it has an outline: the reader sees
 * the country instead of a "location unknown" note.
 */
export function mapPlaces(
	brief: Pick<IntelligenceBrief, "location" | "relatedEvents">,
	countries: CountryIndex | null,
): MapPlaces {
	const focus = countries?.find(brief.location.country) ?? null;
	const others: Country[] = [];
	let countryWide = 0;
	let unknown = 0;

	// The main place counts as unknown only when neither its pin nor its country can be drawn.
	if (!isLocated(brief.location) && !focus) unknown += 1;

	for (const event of brief.relatedEvents) {
		if (isLocated(event)) continue;
		const country = countries?.find(event.place) ?? null;
		if (!country) {
			unknown += 1;
			continue;
		}
		countryWide += 1;
		if (country !== focus && !others.includes(country)) others.push(country);
	}
	return { focus, others, countryWide, unknown };
}

/** The key's line for events drawn as a shaded country. */
export function countryWideLabel(places: MapPlaces): string | null {
	const n = places.countryWide;
	if (n === 0) return null;
	const events = `${n} timeline ${n === 1 ? "event" : "events"}`;
	if (places.others.length === 0 && places.focus) {
		return `${events} ${n === 1 ? "covers" : "cover"} all of ${places.focus.the ? "the " : ""}${places.focus.name}, so ${n === 1 ? "it is" : "they are"} shown by the shading, not a pin`;
	}
	return `${events} ${n === 1 ? "covers" : "cover"} a whole country, so ${n === 1 ? "it is" : "they are"} shown by the shading, not a pin`;
}
