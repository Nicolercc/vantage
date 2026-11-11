import type { IntelligenceBrief } from "@workspace/api-client-react";

/**
 * What to tell a reader about sharing this brief. When the server keeps
 * briefs only in memory, a copied link stops working at its next restart;
 * the reader is told so instead of the link failing for whoever opens it.
 */
export function temporaryLinkNotice(brief: Pick<IntelligenceBrief, "link">): string | null {
	return brief.link?.durable === false
		? "Links are temporary right now: this server isn't saving briefs permanently, so this link will stop working when it restarts."
		: null;
}
