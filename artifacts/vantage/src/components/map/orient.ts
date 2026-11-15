import { describeWhere, inSentence, listNames, type Country, type CountryIndex } from "./countries";
import { scanForWater, type Water } from "./waters";

/** Where a search is about, read from its words alone: no model, no network. */
export type TextPlace = { country: Country | null; water: Water | null };

export function placeFromText(text: string, countries: CountryIndex | null): TextPlace {
	return { country: countries?.scan(text) ?? null, water: scanForWater(text) };
}

/** "The Red Sea lies between Egypt, Sudan … and Saudi Arabia." */
export function describeWater(water: Water, countries: CountryIndex): string {
	const subject = `The ${water.name}`;
	const coast = water.coast.map((name) => countries.find(name)).filter((c): c is Country => c !== null);
	if (coast.length === 0) return `${subject}.`;
	if (coast.length === 1) return `${subject} is in ${inSentence(coast[0])}.`;
	return `${subject} lies between ${listNames(coast.map(inSentence))}.`;
}

/**
 * One or two sentences that place a search before anything else is known.
 * A sea or strait comes first: "Houthi attacks in the Red Sea" is about the sea.
 */
export function describeTextPlace(place: TextPlace, countries: CountryIndex): string | null {
	if (place.water) return describeWater(place.water, countries);
	if (place.country) return describeWhere(place.country, null, countries.neighbours(place.country));
	return null;
}
