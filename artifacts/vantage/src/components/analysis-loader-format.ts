import type { BriefRequest } from "@/lib/brief-request";

/** The words the reader searched, as the page's title. */
export function requestLabel(request: BriefRequest): string {
	if (request.kind === "topic") return request.topic;
	if (request.kind === "url") {
		try {
			return `An article from ${new URL(request.url).hostname.replace(/^www\./, "")}`;
		} catch {
			return "Your article";
		}
	}
	return "Your article";
}

/** "2 minutes ago", "today": how fresh a source is, in words. */
export function freshness(iso: string | null, now = Date.now()): string | null {
	if (!iso) return null;
	const t = Date.parse(iso);
	if (Number.isNaN(t)) return null;
	const hours = Math.max(0, (now - t) / 3_600_000);
	if (hours < 1) return "within the hour";
	if (hours < 24) return `${Math.floor(hours)} ${Math.floor(hours) === 1 ? "hour" : "hours"} ago`;
	const days = Math.floor(hours / 24);
	return `${days} ${days === 1 ? "day" : "days"} ago`;
}
