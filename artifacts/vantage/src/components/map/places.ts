import type { IntelligenceBrief } from "@workspace/api-client-react";
import type { Country, CountryIndex } from "./countries";
import { findWater, type Water } from "./waters";

type Located = { lat: number | null; lng: number | null };
const isLocated = (p: Located) => typeof p.lat === "number" && typeof p.lng === "number";

export type MapPlaces = {
	/** The country the brief is about, shaded on the map. */
	focus: Country | null;
	/** Other countries an event names as a whole, shaded more lightly. */
	others: Country[];
	/** Events with no pin whose place is a whole country: shown by its shading. */
	countryWide: number;
	/** Seas and straits events name, pinned from Vantage's list of waters. */
	waters: Water[];
	/** Events pinned on the water they name. */
	onWater: number;
	/** Places that are neither pinned nor shaded. */
	unknown: number;
};

/**
 * Where to draw an event: the geocoder's confirmed point, or the sea or strait
 * its place names. Null when neither applies (it may still be a shaded country).
 */
export function eventPoint(event: Located & { place?: string | null }): { at: [number, number]; water: Water | null } | null {
	if (isLocated(event)) return { at: [event.lat as number, event.lng as number], water: null };
	const water = findWater(event.place);
	return water ? { at: water.at, water } : null;
}

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
	const waters: Water[] = [];
	let countryWide = 0;
	let onWater = 0;
	let unknown = 0;

	// The main place counts as unknown only when neither its pin nor its country can be drawn.
	if (!isLocated(brief.location) && !focus) unknown += 1;

	for (const event of brief.relatedEvents) {
		if (isLocated(event)) continue;
		const water = findWater(event.place);
		if (water) {
			onWater += 1;
			if (!waters.includes(water)) waters.push(water);
			continue;
		}
		const country = countries?.find(event.place) ?? null;
		if (!country) {
			unknown += 1;
			continue;
		}
		countryWide += 1;
		if (country !== focus && !others.includes(country)) others.push(country);
	}
	return { focus, others, countryWide, waters, onWater, unknown };
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

/** The key's line for events pinned on a sea or strait. */
export function onWaterLabel(places: MapPlaces): string | null {
	const n = places.onWater;
	if (n === 0) return null;
	return `${n} timeline ${n === 1 ? "event is" : "events are"} pinned on the sea or strait ${n === 1 ? "it names" : "they name"}`;
}
