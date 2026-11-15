import type { Claim, Source } from "@workspace/api-client-react";
import { bigNumbers } from "@/lib/big-numbers";
import { Citations } from "./Evidence";

/**
 * The largest figures in the brief, shown big. Each comes from a key fact that
 * passed every check, is written exactly as the fact writes it, and carries
 * the same citation, so a tap shows the words it rests on.
 */
export function KeyNumbers({ keyFacts, sources }: { keyFacts: Claim[]; sources: Source[] }) {
	const numbers = bigNumbers(keyFacts);
	if (numbers.length === 0) return null;
	return (
		<ul className="ci-numbers" aria-label="Key numbers, from checked reporting">
			{numbers.map((n, i) => (
				<li key={i} className="ci-numbers__item">
					<span className="ci-numbers__figure">{n.figure}</span>
					<span className="ci-numbers__caption">
						{n.caption} <Citations claim={n.claim} sources={sources} />
					</span>
				</li>
			))}
		</ul>
	);
}
