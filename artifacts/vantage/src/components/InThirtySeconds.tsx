import type { IntelligenceBrief, Orientation } from "@workspace/api-client-react";
import { KindMark } from "./SourceKind";
import { TermText } from "./Term";

const ROWS: { key: keyof Omit<Orientation, "inScope">; label: string }[] = [
	{ key: "what", label: "What's happening" },
	{ key: "where", label: "Where" },
	{ key: "who", label: "Who's involved" },
	{ key: "whyItMatters", label: "Why it matters" },
];

/**
 * The four-line orientation: written by a fast model before the brief, from
 * general knowledge, so it carries the model-background mark. On the waiting
 * screen it has its own title; on the brief the layer heading names it.
 */
export function InThirtySeconds({
	orientation,
	titled = true,
	glossary,
	used,
}: {
	orientation?: Orientation | null;
	titled?: boolean;
	glossary?: IntelligenceBrief["glossary"];
	used?: Set<string>;
}) {
	if (!orientation?.inScope) return null;
	return (
		<section className="ci-thirty al-card" aria-label="In 30 seconds">
			{titled ? (
				<h2 className="al-card__title">
					In 30 seconds <KindMark kind="background" />
				</h2>
			) : (
				<p className="ci-thirty__kind">
					<KindMark kind="background" /> A quick orientation from AI background knowledge
				</p>
			)}
			<dl className="ci-thirty__rows">
				{ROWS.map(({ key, label }) =>
					orientation[key] ? (
						<div key={key} className="ci-thirty__row">
							<dt>{label}</dt>
							<dd>
								<TermText text={orientation[key]} glossary={glossary} used={used} />
							</dd>
						</div>
					) : null,
				)}
			</dl>
		</section>
	);
}
