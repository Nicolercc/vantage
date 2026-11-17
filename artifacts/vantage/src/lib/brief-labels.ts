import type { IntelligenceBrief } from "@workspace/api-client-react";

/**
 * Where a reader can say a brief is wrong. Opens a pre-filled public issue
 * naming the page they are on: a saved brief and a sample live at different
 * addresses, and only the page's own address always opens the same thing.
 */
export function reportUrl(brief: IntelligenceBrief, pageUrl = window.location.href) {
	const title = `Problem with brief: ${brief.headline}`.slice(0, 120);
	const body = [
		`Brief: ${pageUrl}`,
		`Generated: ${brief.generatedAt}`,
		"",
		"What is wrong (quote the sentence if you can):",
		"",
		"What the source actually says, with a link if you have one:",
		"",
	].join("\n");
	return `https://github.com/Nicolercc/conflict-analysis/issues/new?labels=brief-report&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

/** "10 news reports from 8 outlets": says what it counts, so it can sit beside "Sources (11)". */
export function newsCount(articles: number, outlets: number): string {
	const reports = `${articles} news ${articles === 1 ? "report" : "reports"}`;
	return outlets > 0 ? `${reports} from ${outlets} ${outlets === 1 ? "outlet" : "outlets"}` : reports;
}

/** "10 news reports + 1 background reference": what the Sources count is made of. */
export function sourceBreakdown(brief: Pick<IntelligenceBrief, "sources">): string {
	const news = brief.sources.filter((s) => s.kind === "news").length;
	const other = brief.sources.length - news;
	const parts = [`${news} news ${news === 1 ? "report" : "reports"}`];
	if (other > 0) parts.push(`${other} background ${other === 1 ? "reference" : "references"}`);
	return parts.join(" + ");
}

