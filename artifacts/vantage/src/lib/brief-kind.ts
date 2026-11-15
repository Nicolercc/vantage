import type { Claim, IntelligenceBrief } from "@workspace/api-client-react";

/** A conflict brief, or one saved before other news was briefed (all of those were conflicts). */
export function isConflictBrief(brief: Pick<IntelligenceBrief, "topicType">): boolean {
	return !brief.topicType || brief.topicType === "conflict";
}

const pinned = (p: { lat: number | null; lng: number | null }) => typeof p.lat === "number" && typeof p.lng === "number";

/**
 * Whether "Where this is" belongs on the page. A conflict is always about a
 * place. Other news gets the map only when the brief has a confirmed pin: an
 * airline outage or a court ruling with no single place has nothing to show.
 */
export function showsMap(brief: Pick<IntelligenceBrief, "topicType" | "location" | "relatedEvents">): boolean {
	return isConflictBrief(brief) || pinned(brief.location) || brief.relatedEvents.some(pinned);
}

export type ModuleSection = {
	id: string;
	title: string;
	/** Who or what the section is about: model background. */
	namesLabel: string;
	names: string[];
	/** The time-sensitive part, checked against the sources. */
	claims: Claim[];
	empty: string;
};

/** The extra sections a brief on other news carries, in page order, leaving out any it does not have. */
export function moduleSections(brief: Pick<IntelligenceBrief, "modules">): ModuleSection[] {
	const m = brief.modules;
	if (!m) return [];
	const sections: Array<ModuleSection | null> = [
		m.outage && {
			id: "outage",
			title: "What's down",
			namesLabel: "Services affected",
			names: m.outage.servicesAffected,
			claims: m.outage.status,
			empty: "The retrieved sources do not say what has been restored.",
		},
		m.disaster && {
			id: "disaster",
			title: "Areas affected and official advice",
			namesLabel: "Areas affected",
			names: m.disaster.affectedAreas,
			claims: m.disaster.officialGuidance,
			empty: "The retrieved sources carry no official advice. Check local authorities.",
		},
		m.business && {
			id: "business",
			title: "Companies and markets",
			namesLabel: "Companies",
			names: m.business.companies,
			claims: m.business.marketEffect,
			empty: "The retrieved sources do not report an effect on prices, shares or jobs.",
		},
	];
	return sections.filter((s): s is ModuleSection => s !== null);
}
