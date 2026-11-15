import type { Party } from "./conflict/types";
import { KindMark } from "./SourceKind";

/** Who is involved, as chips. Written by the model from general knowledge, and marked so. */
export function PartiesPanel({ parties }: { parties: Party[]; active?: boolean }) {
	if (!parties.length) return null;
	return (
		<section id="who" className="ci-section ci-section--background" aria-labelledby="who-h" tabIndex={-1}>
			<div className="ci-section__head">
				<h3 className="ci-section__title" id="who-h">
					Who's involved
				</h3>
				<KindMark kind="background" />
			</div>
			<ul className="ci-parties">
				{parties.map((p) => (
					<li key={p.name} className="ci-parties__chip">
						<span className="ci-parties__dot" style={{ background: p.color }} aria-hidden />
						{p.name}
					</li>
				))}
			</ul>
		</section>
	);
}
