import type { IntelligenceBrief } from "@workspace/api-client-react";

/**
 * What to tell a reader about sharing this brief. When the server keeps
 * briefs only in memory, a copied link stops working at its next restart;
 * the reader is told so instead of the link failing for whoever opens it.
 */
export function temporaryLinkNotice(brief: Pick<IntelligenceBrief, "link">): string | null {
	return brief.link?.durable === false
		? "Temporary link: it will stop working when the server restarts."
		: null;
}
