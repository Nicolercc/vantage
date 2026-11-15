import type { TrendingResponse, TrendingTopic } from "@workspace/api-client-react";
import { briefPath } from "./brief-request";

/** Shown when there is no ranking to show: before the API answers it, or when it fails or is empty. */
export const QUICK_TOPICS = [
	"Red Sea shipping",
	"Sudan aid access",
	"Gaza ceasefire",
	"Ukraine front line",
];

/** Cards shown before "Show more". */
export const TODAY_VISIBLE = 4;

export type HomeTopics =
	| { kind: "loading" }
	| { kind: "today"; topics: TrendingTopic[]; outletCount: number }
	| { kind: "examples"; topics: string[] };

type Query = { status: "pending" | "error" | "success"; data?: TrendingResponse };

/**
 * What the home page offers to start from: today's most covered topics when
 * there are any, otherwise the fixed examples. A failure or an empty ranking
 * is never shown as an error: the examples are still a way in.
 */
export function homeTopics(query: Query): HomeTopics {
	if (query.status === "pending") return { kind: "loading" };
	const topics = query.status === "success" ? (query.data?.topics ?? []) : [];
	if (topics.length === 0) return { kind: "examples", topics: QUICK_TOPICS };
	return { kind: "today", topics, outletCount: query.data?.outletCount ?? 0 };
}

/**
 * Where a card leads: the ordinary topic brief page. A topic whose brief is
 * ready opens at once from the server's cache; one that is not is written
 * then. Never a stored-brief link, which could have expired since the list
 * was fetched.
 */
export const todayHref = (topic: TrendingTopic) => briefPath({ kind: "topic", topic: topic.label });

export const isReady = (topic: TrendingTopic) => topic.briefId !== null;

/** "Most covered in the last 24 hours across 23 outlets we read". */
export function todayCaption(outletCount: number, windowHours = 24): string {
	const span = windowHours === 24 ? "the last 24 hours" : `the last ${windowHours} hours`;
	return `Most covered in ${span} across ${outletCount} ${outletCount === 1 ? "outlet" : "outlets"} we read`;
}

/** "just now", "25 min ago", "3 h ago". */
export function timeAgo(iso: string, now = Date.now()): string {
	const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
	if (!Number.isFinite(minutes)) return "";
	if (minutes < 2) return "just now";
	if (minutes < 60) return `${minutes} min ago`;
	return `${Math.round(minutes / 60)} h ago`;
}

/** One sentence a screen reader reads for a card, with everything it shows. */
export function cardLabel(topic: TrendingTopic, now = Date.now()): string {
	const place = topic.country !== topic.label ? `${topic.label}, ${topic.country}` : topic.label;
	const state = isReady(topic) ? "Brief ready" : "Brief takes about a minute";
	return `${place}. ${topic.outletCount} outlets, newest ${timeAgo(topic.newestAt, now)}: ${topic.headline.title}. ${state}.`;
}
