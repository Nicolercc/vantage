import type { Orientation } from "@workspace/api-client-react";
import { KindTag } from "./SourceKind";

export function InThirtySeconds({ orientation }: { orientation?: Orientation | null }) {
	if (!orientation?.inScope) return null;
	return (
		<section className="al-card" aria-label="In 30 seconds">
			<h2 className="al-card__title">In 30 seconds</h2>
			<KindTag kind="background" />
			<dl>
				<dt>What happened</dt><dd>{orientation.what}</dd>
				<dt>Where</dt><dd>{orientation.where}</dd>
				<dt>Who's involved</dt><dd>{orientation.who}</dd>
				<dt>Why it matters</dt><dd>{orientation.whyItMatters}</dd>
			</dl>
		</section>
	);
}
