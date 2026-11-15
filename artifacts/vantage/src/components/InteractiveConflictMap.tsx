import { useEffect, useRef, useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { inSentence, labelPoint, listNames } from "./map/countries";
import { countryWideLabel, mapPlaces } from "./map/places";
import { useCountries } from "./map/useCountries";
import type {
	IntelligenceBrief,
	RelatedEvent,
	RelatedEventType,
} from "@workspace/api-client-react";

const W = 800;
const H = 265;

const TYPE_META: Record<
	RelatedEventType,
	{ label: string; color: string; short: string }
> = {
	strike: {
		label: "Strike",
		color: "#C2536A",
		short: "Military or kinetic event",
	},
	escalation: {
		label: "Escalation",
		color: "#E07B39",
		short: "Heightened tensions or threat",
	},
	negotiation: {
		label: "Diplomacy",
		color: "#4A9B8B",
		short: "Talks or negotiated process",
	},
	humanitarian: {
		label: "Humanitarian",
		color: "#3B78D4",
		short: "Civilian impact or aid",
	},
	political: {
		label: "Political",
		color: "#9B7BC8",
		short: "Political or institutional move",
	},
};

const HUB_COLOR = "#1a3a52";

/** Events further than this from the main location are outside the opening view. */
const NEARBY_METRES = 2_000_000;

function metresBetween(a: L.LatLngTuple, b: L.LatLngTuple) {
	const rad = (d: number) => (d * Math.PI) / 180;
	const h =
		Math.sin(rad(b[0] - a[0]) / 2) ** 2 +
		Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
	return 6_371_000 * 2 * Math.asin(Math.sqrt(h));
}

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/** Null when either coordinate is unknown, so nothing is plotted at a default point. */
function toLatLng(p: {
	lat: number | null;
	lng: number | null;
}): L.LatLngTuple | null {
	return typeof p.lat === "number" && typeof p.lng === "number"
		? [p.lat, p.lng]
		: null;
}

/**
 * Events that happened in the same place would draw on top of each other (and
 * on the primary pin). Each one after the first is drawn a fixed distance to
 * the side, on a ring, so every marker stays visible and clickable. Only the
 * drawing moves; the coordinates are unchanged.
 */
export function overlapOffsets(
	hub: L.LatLngTuple | null,
	positions: L.LatLngTuple[],
	radius = 26,
): Array<[number, number]> {
	const key = (p: L.LatLngTuple) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
	const taken = new Map<string, number>();
	if (hub) taken.set(key(hub), 1);
	return positions.map((p) => {
		const n = taken.get(key(p)) ?? 0;
		taken.set(key(p), n + 1);
		if (n === 0) return [0, 0];
		const angle = -Math.PI / 6 + (n - 1) * (Math.PI / 3);
		return [Math.round(radius * Math.cos(angle)), Math.round(radius * Math.sin(angle))];
	});
}

function escapeHtml(s: string) {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function truncate(s: string, max: number) {
	const t = s.trim();
	if (t.length <= max) return t;
	return t.slice(0, max).trim() + "…";
}

function markerKind(evt: RelatedEvent): "strike" | "talks" | "affected" {
	const t = evt.type;
	if (t === "strike") return "strike";
	if (t === "negotiation") return "talks";
	return "affected";
}

function hubIconHtml(city: string) {
	const label = escapeHtml(truncate(city, 22));
	return `
<div class="ci-map-hub" aria-hidden="true">
  <div class="ci-map-hub__pulse"></div>
  <div class="ci-map-hub__pin">
    <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.3 0 0 6.1 0 13.6c0 10.2 14 22.4 14 22.4S28 23.8 28 13.6C28 6.1 21.7 0 14 0z" fill="${HUB_COLOR}"/>
      <circle cx="14" cy="13" r="5" fill="white" opacity="0.95"/>
    </svg>
  </div>
  <span class="ci-map-hub__label">${label}</span>
</div>`;
}

function eventIconHtml(evt: RelatedEvent) {
	const meta = TYPE_META[evt.type];
	const color = meta.color;
	const kind = markerKind(evt);

	if (kind === "strike") {
		return `
<div class="ci-map-ev ci-map-ev--strike" style="--ev:${color}">
  <span class="ci-map-ev__ring"></span>
  <span class="ci-map-ev__shape"></span>
</div>`;
	}
	if (kind === "talks") {
		return `
<div class="ci-map-ev ci-map-ev--talks" style="--ev:${color}">
  <span class="ci-map-ev__ring ci-map-ev__ring--slow"></span>
  <span class="ci-map-ev__dot"></span>
</div>`;
	}
	return `
<div class="ci-map-ev ci-map-ev--affected" style="--ev:${color}">
  <span class="ci-map-ev__ring"></span>
  <span class="ci-map-ev__dot"></span>
</div>`;
}

function eventTooltipHtml(evt: RelatedEvent) {
	const meta = TYPE_META[evt.type];
	return `
<div class="ci-leaflet-tip">
  <div class="ci-leaflet-tip__row">
    <span class="ci-leaflet-tip__badge" style="background:${meta.color}22;border-color:${meta.color}55;color:${meta.color}">${escapeHtml(meta.label)}</span>
    <span class="ci-leaflet-tip__date">${escapeHtml(evt.date)}</span>
  </div>
  <div class="ci-leaflet-tip__title">${escapeHtml(evt.title)}</div>
  <p class="ci-leaflet-tip__desc">${escapeHtml(truncate(evt.description, 220))}</p>
  <span class="ci-leaflet-tip__hint">${escapeHtml(meta.short)}</span>
</div>`;
}

function hubTooltipHtml(brief: IntelligenceBrief) {
	const loc = `${brief.location.city}, ${brief.location.country}`;
	return `
<div class="ci-leaflet-tip ci-leaflet-tip--hub">
  <span class="ci-leaflet-tip__badge ci-leaflet-tip__badge--hub">Primary focus</span>
  <div class="ci-leaflet-tip__title">${escapeHtml(loc)}</div>
  <p class="ci-leaflet-tip__desc">${escapeHtml(truncate(brief.headline, 200))}</p>
  <span class="ci-leaflet-tip__hint">Central location for this briefing</span>
</div>`;
}

type LegendItem = { key: string; label: string; swatch?: { shape: "dot" | "diamond" | "area"; color: string } };

const OTHER_AREA_COLOR = "#6b7c8c";
/** Closer than this to the main pin, the country's own name would sit under the pin's label. */
const LABEL_CLEARANCE_METRES = 350_000;
const FOCUS_AREA_STYLE: L.PathOptions = { color: HUB_COLOR, weight: 1.5, opacity: 0.8, fillColor: HUB_COLOR, fillOpacity: 0.1 };
const OTHER_AREA_STYLE: L.PathOptions = {
	color: OTHER_AREA_COLOR,
	weight: 1,
	opacity: 0.7,
	dashArray: "4 4",
	fillColor: OTHER_AREA_COLOR,
	fillOpacity: 0.06,
};

/**
 * A country is framed only when it fits a sensible view. Russia, the United
 * States (with Alaska) or a country crossing the date line would zoom the map
 * out to the whole world.
 */
function framable(bounds: L.LatLngBounds) {
	return bounds.isValid() && bounds.getEast() - bounds.getWest() <= 100;
}

/**
 * One key entry per kind of event on the map, in the colour and shape its
 * marker is drawn with, so every pin can be matched to its label.
 */
export function eventLegend(events: Pick<RelatedEvent, "type">[]): LegendItem[] {
	const present = new Set(events.map((e) => e.type));
	return (Object.keys(TYPE_META) as RelatedEventType[])
		.filter((type) => present.has(type))
		.map((type) => ({
			key: type,
			label: TYPE_META[type].label,
			swatch: { shape: type === "strike" ? "diamond" : "dot", color: TYPE_META[type].color },
		}));
}

/** The view when nothing in the brief can be placed. Never below the map's own minimum zoom. */
const MIN_ZOOM = 3;
const WORLD_VIEW: { center: L.LatLngTuple; zoom: number } = { center: [20, 0], zoom: MIN_ZOOM };

const TOOLTIP_OPTS: L.TooltipOptions = {
	sticky: true,
	direction: "top",
	opacity: 1,
	className: "ci-leaflet-tooltip",
	interactive: true,
};

const TILE_ATTR =
	'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

interface InteractiveConflictMapProps {
	data: IntelligenceBrief;
	active: boolean;
	/** A timeline event to show; `at` changes on every request so the same event can be shown twice. */
	showEvent?: { index: number; at: number } | null;
}

export function InteractiveConflictMap({
	data,
	active,
	showEvent = null,
}: InteractiveConflictMapProps) {
	const eventMarkersRef = useRef(new Map<number, L.Marker>());
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<L.Map | null>(null);
	const layersRef = useRef<{
		polylines: L.Polyline[];
		markers: L.Marker[];
		areas: L.GeoJSON[];
	}>({ polylines: [], markers: [], areas: [] });
	const [mapReady, setMapReady] = useState(false);
	const countries = useCountries();
	const places = mapPlaces(data, countries);

	useEffect(() => {
		if (!active) {
			setMapReady(false);
			return;
		}

		const el = containerRef.current;
		if (!el || mapRef.current) return;

		const map = L.map(el, {
			scrollWheelZoom: true,
			zoomControl: true,
			attributionControl: true,
			minZoom: MIN_ZOOM,
			maxZoom: 14,
			worldCopyJump: true,
		});

		// A map with no view cannot draw shapes: a country outline added before the
		// first view would crash Leaflet. Start on the world; the brief reframes it.
		map.setView(WORLD_VIEW.center, WORLD_VIEW.zoom);

		if (map.zoomControl) {
			map.zoomControl.setPosition("bottomright");
		}

		L.tileLayer(TILE_URL, {
			maxZoom: 19,
			attribution: TILE_ATTR,
		}).addTo(map);

		// One tab stop for the whole map: arrow keys pan and +/- zoom once it has
		// focus, so its buttons and credit links need not each be a stop. The
		// credit is written when a layer is added, so this runs again then.
		const singleTabStop = () =>
			el.querySelectorAll<HTMLElement>("a, button").forEach((control) => {
				control.tabIndex = -1;
			});
		singleTabStop();
		map.on("layeradd", singleTabStop);

		mapRef.current = map;
		setMapReady(true);

		const ro = new ResizeObserver(() => {
			map.invalidateSize({ animate: false });
		});
		ro.observe(el);

		return () => {
			ro.disconnect();
			map.remove();
			mapRef.current = null;
			setMapReady(false);
		};
	}, [active]);

	useEffect(() => {
		const map = mapRef.current;
		if (!map || !mapReady || !active) return;

		layersRef.current.polylines.forEach((p) => {
			p.remove();
		});
		layersRef.current.markers.forEach((m) => {
			m.remove();
		});
		layersRef.current.areas.forEach((a) => {
			a.remove();
		});
		layersRef.current = { polylines: [], markers: [], areas: [] };
		eventMarkersRef.current.clear();

		// Countries first, so pins and lines draw over them.
		const { focus, others } = mapPlaces(data, countries);
		others.forEach((country) => {
			layersRef.current.areas.push(L.geoJSON(country.shape, { style: OTHER_AREA_STYLE, interactive: false }).addTo(map));
		});
		const focusArea = focus ? L.geoJSON(focus.shape, { style: FOCUS_AREA_STYLE, interactive: false }).addTo(map) : null;
		if (focusArea) layersRef.current.areas.push(focusArea);
		const focusBounds = focusArea && framable(focusArea.getBounds()) ? focusArea.getBounds() : null;

		const hub = toLatLng(data.location);

		// Country names in English, from the map data. The tiles name places in
		// their local languages, which a reader may not be able to read.
		const labelled = focus && countries ? [focus, ...countries.neighbours(focus)] : [];
		others.forEach((c) => {
			if (!labelled.includes(c)) labelled.push(c);
		});
		labelled.forEach((country) => {
			let at = labelPoint(country.shape);
			const isFocus = country === focus;
			// The main pin carries its own label: move the country's name halfway
			// towards its southern edge so the two do not sit on each other.
			if (isFocus && hub && focusArea && map.distance(hub, at) < LABEL_CLEARANCE_METRES) {
				at = [(at[0] + focusArea.getBounds().getSouth()) / 2, at[1]];
			}
			layersRef.current.markers.push(
				L.marker(at, {
					icon: L.divIcon({
						className: `ci-map-country${isFocus ? " ci-map-country--focus" : ""}`,
						html: `<span>${escapeHtml(country.name)}</span>`,
						iconSize: [0, 0],
					}),
					interactive: false,
					keyboard: false,
				}).addTo(map),
			);
		});
		const located = data.relatedEvents.flatMap((evt) => {
			const pos = toLatLng(evt);
			return pos ? [{ evt, pos }] : [];
		});
		const points = [...(hub ? [hub] : []), ...located.map((l) => l.pos)];
		if (points.length === 0) {
			if (focusBounds) map.fitBounds(focusBounds, { padding: [24, 24], maxZoom: 7, animate: false });
			else if (focusArea) map.setView(focusArea.getBounds().getCenter(), MIN_ZOOM);
			else map.setView(WORLD_VIEW.center, WORLD_VIEW.zoom);
			return;
		}

		const lineStyle: L.PolylineOptions = {
			color: "#8a9aaa",
			weight: 1.5,
			opacity: 0.55,
			dashArray: "6 8",
			lineCap: "round",
		};

		if (hub) {
			located.forEach(({ pos }) => {
				const line = L.polyline([hub, pos], lineStyle).addTo(map);
				layersRef.current.polylines.push(line);
			});
		}

		const hubMarker = !hub ? null : L.marker(hub, {
			icon: L.divIcon({
				className: "ci-map-marker-wrap ci-map-marker-wrap--hub",
				html: hubIconHtml(data.location.city),
				iconSize: [120, 48],
				iconAnchor: [60, 44],
			}),
			// Every mapped event is also in the timeline, so markers stay out of the tab order.
			keyboard: false,
			title: `${data.location.city} — primary focus`,
		})
			.addTo(map)
			.bindTooltip(hubTooltipHtml(data), { ...TOOLTIP_OPTS, offset: [0, -36] });

		if (hubMarker) layersRef.current.markers.push(hubMarker);

		const offsets = overlapOffsets(hub, located.map((l) => l.pos));
		located.forEach(({ evt, pos }, i) => {
			const [dx, dy] = offsets[i] ?? [0, 0];
			const marker = L.marker(pos, {
				icon: L.divIcon({
					className: "ci-map-marker-wrap",
					html: eventIconHtml(evt),
					iconSize: [36, 36],
					iconAnchor: [18 - dx, 18 - dy],
				}),
				keyboard: false,
				title: evt.title,
			})
				.addTo(map)
				.bindTooltip(eventTooltipHtml(evt), {
					...TOOLTIP_OPTS,
					offset: [0, -20],
				});

			marker.on("click", () => {
				map.flyTo(pos, Math.max(map.getZoom(), 7), { duration: 0.85 });
				// A tap has no hover: open the event's card on click too.
				marker.openTooltip();
			});

			layersRef.current.markers.push(marker);
			eventMarkersRef.current.set(data.relatedEvents.indexOf(evt), marker);
		});

		// Frame the region the brief is about: the whole country, and the pins near
		// it. An event far away (talks in Geneva, a vote in New York) stays on the
		// map but does not shrink the view to a whole hemisphere; the key says it is there.
		const near = hub ? points.filter((p) => map.distance(hub, p) <= NEARBY_METRES) : points;
		const frame = L.latLngBounds(near);
		if (focusBounds) frame.extend(focusBounds);
		if (!focusBounds && near.length <= 1) {
			map.setView(near[0] ?? points[0], 6);
		} else {
			// Extra room at the top: the main pin and its label stand above their point.
			map.fitBounds(frame, { paddingTopLeft: [36, 84], paddingBottomRight: [36, 36], maxZoom: 8, animate: false });
		}

		queueMicrotask(() => map.invalidateSize());
	}, [data, active, mapReady, countries]);

	// "Show on map" from the timeline: move to the event's pin and open its card,
	// or, for an event that covers a whole country, frame that country.
	useEffect(() => {
		const map = mapRef.current;
		if (!map || !mapReady || !showEvent) return;
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		const marker = eventMarkersRef.current.get(showEvent.index);
		if (marker) {
			const zoom = Math.max(map.getZoom(), 7);
			if (reduce) map.setView(marker.getLatLng(), zoom);
			else map.flyTo(marker.getLatLng(), zoom, { duration: 0.85 });
			marker.openTooltip();
			return;
		}
		const country = countries?.find(data.relatedEvents[showEvent.index]?.place);
		if (country) {
			const bounds = L.geoJSON(country.shape).getBounds();
			if (framable(bounds)) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 7, animate: !reduce });
		}
	}, [showEvent, mapReady, countries, data]);

	const hasHub = toLatLng(data.location) !== null;
	const locatedEvents = data.relatedEvents.filter((e) => toLatLng(e) !== null);
	const unplotted = places.unknown;
	const legend: LegendItem[] = [];
	if (places.focus) {
		legend.push({
			key: "focus-area",
			label: `Shaded: ${places.focus.the ? "the " : ""}${places.focus.name}, the country this brief is about`,
			swatch: { shape: "area", color: HUB_COLOR },
		});
	}
	if (places.others.length > 0) {
		legend.push({
			key: "other-areas",
			label: `Lightly shaded: ${listNames(places.others.map(inSentence))}, also named in the timeline`,
			swatch: { shape: "area", color: OTHER_AREA_COLOR },
		});
	}
	if (hasHub) {
		const city = data.location.city.trim();
		legend.push({
			key: "hub",
			label: city ? `${city}: the main place in this brief` : "The main place in this brief",
			swatch: { shape: "dot", color: "var(--accent-navy, #1a3a52)" },
		});
	}
	legend.push(...eventLegend(locatedEvents));
	const covered = countryWideLabel(places);
	if (covered) legend.push({ key: "country-wide", label: covered });
	const hubPoint = toLatLng(data.location);
	const elsewhere = hubPoint
		? locatedEvents.filter((e) => metresBetween(hubPoint, toLatLng(e)!) > NEARBY_METRES).length
		: 0;
	if (elsewhere > 0) {
		legend.push({
			key: "elsewhere",
			label: `${elsewhere} ${elsewhere === 1 ? "event" : "events"} further away: zoom out to see ${elsewhere === 1 ? "it" : "them"}`,
		});
	}
	if (unplotted > 0) {
		legend.push({
			key: "unplotted",
			label: `${unplotted} ${unplotted === 1 ? "place" : "places"} not shown: location unknown`,
		});
	}

	return (
		<div className="ci-map">
			<div
				className="ci-interactive-map"
				style={{
					position: "relative",
					width: "100%",
					aspectRatio: `${W} / ${H}`,
					minHeight: 300,
					maxHeight: 420,
				}}
			>
				<p className="sr-only">
					Map of the country this brief is about, its main location and related
					events. Every mapped event is also listed in the background timeline.
				</p>

				<div
					ref={containerRef}
					className="ci-interactive-map__leaflet leaflet-container"
					style={{
						height: "100%",
						width: "100%",
						borderRadius: 0,
						zIndex: 1,
					}}
					role="application"
					aria-label="Map of the places in this brief. Arrow keys pan; plus and minus zoom. Each mapped event is also listed in the timeline."
					tabIndex={0}
				/>
			</div>

			{/* The key sits under the map so it never covers it on a narrow screen. */}
			{legend.length > 0 && (
				<ul className="ci-map-legend" aria-label="Map key">
					{legend.map((item) => (
						<li key={item.key} className="ci-map-legend__item">
							{item.swatch ? (
								<span
									aria-hidden
									className={`ci-map-legend__swatch ci-map-legend__swatch--${item.swatch.shape}`}
									style={
										item.swatch.shape === "area"
											? { borderColor: item.swatch.color, background: `${item.swatch.color}26` }
											: { background: item.swatch.color }
									}
								/>
							) : null}
							{item.label}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
