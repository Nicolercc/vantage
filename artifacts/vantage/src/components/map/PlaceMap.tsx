import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { labelPoint, type Country, type CountryIndex } from "./countries";
import type { Water } from "./waters";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const FOCUS = "#1a3a52";
const COAST = "#6b7c8c";
const WATER = "#2b5f8a";

function escapeHtml(s: string) {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function label(at: [number, number], text: string, className: string) {
	return L.marker(at, {
		icon: L.divIcon({ className, html: `<span>${escapeHtml(text)}</span>`, iconSize: [0, 0] }),
		interactive: false,
		keyboard: false,
	});
}

/**
 * A still picture of where a search is about, drawn the moment the search
 * starts: the country shaded with its neighbours named, or a sea with the
 * countries on its shores. It cannot be dragged or zoomed; the text beside it
 * says the same thing for screen readers.
 */
export function PlaceMap({
	country,
	water,
	countries,
}: {
	country: Country | null;
	water: Water | null;
	countries: CountryIndex;
}) {
	const el = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const node = el.current;
		if (!node || (!country && !water)) return;
		const map = L.map(node, {
			zoomControl: false,
			attributionControl: true,
			dragging: false,
			scrollWheelZoom: false,
			doubleClickZoom: false,
			boxZoom: false,
			keyboard: false,
			touchZoom: false,
			zoomSnap: 0.25,
		});
		map.setView([20, 0], 3);
		L.tileLayer(TILE_URL, { maxZoom: 12, attribution: TILE_ATTR }).addTo(map);
		// The credit link stays readable but out of the tab order, like the brief's map.
		node.querySelectorAll<HTMLElement>("a").forEach((a) => (a.tabIndex = -1));
		map.on("layeradd", () => node.querySelectorAll<HTMLElement>("a").forEach((a) => (a.tabIndex = -1)));

		const frame = L.latLngBounds([]);
		const named: Country[] = [];
		const shade = (c: Country, focus: boolean) => {
			const layer = L.geoJSON(c.shape, {
				interactive: false,
				style: focus
					? { color: FOCUS, weight: 1.5, fillColor: FOCUS, fillOpacity: 0.12 }
					: { color: COAST, weight: 1, dashArray: "4 4", fillColor: COAST, fillOpacity: 0.05 },
			}).addTo(map);
			const b = layer.getBounds();
			if (b.isValid() && b.getEast() - b.getWest() <= 100) frame.extend(b);
			named.push(c);
		};

		if (water) {
			water.coast.map((n) => countries.find(n)).forEach((c) => c && shade(c, c === country));
			L.circleMarker(water.at, { radius: 7, color: WATER, weight: 2, fillColor: WATER, fillOpacity: 0.25, interactive: false }).addTo(map);
			label(water.at, water.name, "ci-map-water").addTo(map);
			frame.extend(water.at);
		} else if (country) {
			shade(country, true);
			countries.neighbours(country).forEach((n) => {
				named.push(n);
			});
		}
		if (country && !named.includes(country)) shade(country, true);

		named.forEach((c) => {
			label(labelPoint(c.shape), c.name, `ci-map-country${c === country ? " ci-map-country--focus" : ""}`).addTo(map);
		});

		if (frame.isValid()) {
			map.fitBounds(frame, { padding: [18, 18], maxZoom: water && !water.coast.length ? 5 : 6, animate: false });
		}
		const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
		ro.observe(node);
		return () => {
			ro.disconnect();
			map.remove();
		};
	}, [country, water, countries]);

	if (!country && !water) return null;
	return <div ref={el} className="ci-place-map ci-interactive-map" aria-hidden="true" />;
}
