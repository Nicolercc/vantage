import { useEffect, useState } from "react";
import { loadCountries, type CountryIndex } from "./countries";

/** The country outlines, or null while they load or if they cannot be loaded. */
export function useCountries(): CountryIndex | null {
	const [index, setIndex] = useState<CountryIndex | null>(null);
	useEffect(() => {
		let live = true;
		loadCountries()
			.then((loaded) => {
				if (live) setIndex(loaded);
			})
			// Without outlines the map still shows its pins; nothing to tell the reader.
			.catch(() => {});
		return () => {
			live = false;
		};
	}, []);
	return index;
}
