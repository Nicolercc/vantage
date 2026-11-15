import type { Source, Stakeholder } from "@workspace/api-client-react";
import type { ModuleSection } from "@/lib/brief-kind";
import { ClaimList } from "./Evidence";

/** Who is involved in a story that is not a conflict, and what each wants. Model background. */
export function StakeholderList({ stakeholders }: { stakeholders: Stakeholder[] }) {
	return (
		<ul className="ci-stakeholders">
			{stakeholders.map((s) => (
				<li key={s.name} className="ci-stakeholders__item">
					<strong className="ci-stakeholders__name">{s.name}</strong>
					<span className="ci-stakeholders__role">{s.role}</span>
					{s.stance ? <span className="ci-stakeholders__stance">{s.stance}</span> : null}
				</li>
			))}
		</ul>
	);
}

/** One extra section: the names it is about (background), then its checked claims. */
export function ModuleBody({ section, sources }: { section: ModuleSection; sources: Source[] }) {
	return (
		<>
			{section.names.length > 0 ? (
				<p className="ci-section__note">
					{section.namesLabel} (background): {section.names.join(", ")}
				</p>
			) : null}
			<ClaimList claims={section.claims} sources={sources} empty={section.empty} />
		</>
	);
}
