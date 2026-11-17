import type { IntelligenceBrief, Source } from "@workspace/api-client-react";

/**
 * A made-up brief shaped exactly like the API's, typed against the generated
 * client so a contract change breaks this file at compile time, not silently
 * in a browser. The text is written for these tests; the sources point to
 * example.org. It exercises every part of the page: orientation, glossary,
 * key numbers, coverage, map pins on land and on water, and folded sections.
 */
const source = (n: number, publisher: string, country: string, title: string): Source => ({
	id: `S${n}`,
	kind: "news",
	provider: `${publisher} RSS`,
	publisher,
	title,
	url: `https://example.org/story-${n}`,
	publishedAt: "2026-11-14T09:00:00Z",
	retrievedAt: "2026-11-15T09:00:00Z",
	language: "en",
	country,
	excerpt: `${title}. Aid agencies say about 34 million people need help and the appeal is 47% funded.`,
});

export const SOURCES: Source[] = [
	source(1, "Example World", "United Kingdom", "Aid convoys stall as fighting spreads"),
	source(2, "Example Africa", "Kenya", "Appeal for Sudan only 47% funded"),
	source(3, "Example Gulf", "Qatar", "Shipping slows in the Red Sea"),
	{ ...source(4, "Wikipedia", "", "Sudanese civil war"), kind: "reference", country: null },
];

export const BRIEF: IntelligenceBrief = {
	id: "e2eBrief0001",
	generatedAt: "2026-11-15T09:05:00Z",
	inScope: true,
	headline: "Aid struggles to reach people as fighting spreads in Sudan",
	location: { city: "Khartoum", country: "Sudan", region: "Northeast Africa", lat: 15.5635, lng: 32.5349 },
	orientation: {
		inScope: true,
		what: "Two armed forces are fighting for control of Sudan.",
		where: "Sudan, in northeast Africa, south of Egypt.",
		who: "The national army (SAF) and the RSF, a paramilitary group.",
		whyItMatters: "Millions of people need food and safe places to live.",
	},
	glossary: [
		{ term: "SAF", meaning: "Sudanese Armed Forces, the national army." },
		{ term: "RSF", meaning: "Rapid Support Forces, a paramilitary group fighting the army." },
	],
	summary: "Fighting between the SAF and the RSF has spread, and aid convoys are struggling to reach people in need.",
	actors: ["Sudanese Armed Forces (SAF)", "Rapid Support Forces (RSF)", "UN agencies", "Displaced families"],
	perspectives: [
		{ actor: "UN agencies", alignment: "Civil Society", framing: "Access for aid is the most urgent need.", interests: "Reaching people safely." },
		{ actor: "Displaced families", alignment: "Affected Population", framing: "Families want safety and food first.", interests: "Survival and return home." },
		{ actor: "Neighbouring states", alignment: "Regional", framing: "The war risks spilling over borders.", interests: "Stable borders." },
	],
	relatedEvents: [
		{ date: "Apr 2023", title: "Fighting breaks out in the capital", description: "Clashes began between the two forces.", type: "escalation", place: "Khartoum, Sudan", lat: 15.5635, lng: 32.5349, searchQuery: "Sudan fighting Khartoum April 2023" },
		{ date: "Jan 2024", title: "Attacks on shipping in the Red Sea", description: "Shipping routes near Sudan slowed.", type: "strike", place: "Red Sea", lat: null, lng: null, searchQuery: "Red Sea shipping attacks" },
		{ date: "Nov 2026", title: "Aid appeal falls short", description: "The UN appeal remains under half funded.", type: "humanitarian", place: "Sudan", lat: null, lng: null, searchQuery: "Sudan aid appeal funding" },
	],
	escalationRisk: "High",
	escalationReason: "Both forces are still fighting for territory.",
	historicalContext: "Sudan has seen long periods of conflict and military rule since independence.",
	affectedPopulation: "Millions of people have left their homes.",
	keyQuestion: "Can aid groups get safe access to the worst-hit areas?",
	casualtyData: { description: "Exact totals are uncertain.", civilianImpact: "Hospitals and markets have been damaged.", allSides: "All sides report losses." },
	sources: SOURCES,
	keyFacts: [
		{ text: "About 34 million people need humanitarian help.", sourceIds: ["S1"], evidence: [{ sourceId: "S1", quote: "about 34 million people need help" }], support: "verified" },
		{ text: "The aid appeal for Sudan is 47% funded.", sourceIds: ["S2"], evidence: [{ sourceId: "S2", quote: "the appeal is 47% funded" }], support: "verified" },
		{ text: "Aid convoys have stalled as fighting spreads.", sourceIds: ["S1"], evidence: [{ sourceId: "S1", quote: "Aid convoys stall as fighting spreads" }], support: "verified" },
	],
	coverage: {
		agreements: [{ text: "Outlets agree aid is not reaching enough people.", sourceIds: ["S1", "S2"], evidence: [{ sourceId: "S1", quote: "Aid convoys stall" }, { sourceId: "S2", quote: "only 47% funded" }], support: "verified" }],
		differences: [],
	},
	verification: { status: "verified", checked: 4, removed: 0, corrected: 0 },
	retrieval: [
		{ provider: "Example World RSS", status: "ok", count: 1 },
		{ provider: "News search", status: "ok", count: 2 },
		{ provider: "Example Feed RSS", status: "failed", count: 0 },
	],
	link: { durable: true },
};
