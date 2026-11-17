import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import type { IntelligenceBrief } from "@workspace/api-client-react";
import { InThirtySeconds } from "./InThirtySeconds";
import { KeyNumbers } from "./KeyNumbers";
import { bigNumbers } from "@/lib/big-numbers";
import { TermText, WordsToKnow } from "./Term";
import "./AnalysisLoader.css";
import { Shell } from "./Notice";
import { PerspectivesPanel } from "./PerspectivesPanel";
import { EventTimeline } from "./EventTimeline";
import { CasualtyPanel } from "./CasualtyPanel";
import { InteractiveConflictMap } from "./InteractiveConflictMap";
import { ConflictBackground } from "./ConflictBackground";
import { KindMark, ReadingKey, type Kind } from "./SourceKind";
import { temporaryLinkNotice } from "@/lib/share-link";
import { ClaimList, RetrievalSummary, SourceList } from "./Evidence";
import { adaptBrief } from "./conflict/adapter";
import { PartiesPanel } from "./PartiesPanel";
import { describeWhere, type CountryIndex } from "./map/countries";
import { useCountries } from "./map/useCountries";
import { eventPoint } from "./map/places";
import { isConflictBrief, moduleSections, showsMap } from "@/lib/brief-kind";
import { ModuleBody, StakeholderList } from "./NewsSections";
import "./ConflictAnalysisPageLayout.css";

function formatPublishedAt(iso: string) {
	try {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return "date unavailable";
		return d.toLocaleString(undefined, {
			dateStyle: "medium",
			timeStyle: "short",
		});
	} catch {
		return iso;
	}
}

/** Where a reader can say a brief is wrong. Opens a pre-filled public issue naming the brief. */
function reportUrl(brief: IntelligenceBrief) {
	const title = `Problem with brief: ${brief.headline}`.slice(0, 120);
	const body = [
		`Brief: ${window.location.origin}/brief/${brief.id}`,
		`Generated: ${brief.generatedAt}`,
		"",
		"What is wrong (quote the sentence if you can):",
		"",
		"What the source actually says, with a link if you have one:",
		"",
	].join("\n");
	return `https://github.com/Nicolercc/conflict-analysis/issues/new?labels=brief-report&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

/**
 * One part of the brief. Every section says where its content comes from, so
 * the difference between cited reporting and model background travels with
 * the text and does not depend on a notice the reader may have scrolled past.
 */
function Section({
	id,
	title,
	kind,
	collapsible = false,
	startOpen,
	children,
}: {
	id: string;
	title: string;
	kind: Kind;
	/** Background sections fold away on small screens so the sourced part stays close. */
	collapsible?: boolean;
	startOpen: boolean;
	children: ReactNode;
}) {
	const heading = (
		<>
			<h3 className="ci-section__title">{title}</h3>
			<KindMark kind={kind} />
		</>
	);
	if (!collapsible) {
		return (
			<section id={id} className={`ci-section ci-section--${kind}`} aria-labelledby={`${id}-h`} tabIndex={-1}>
				<div className="ci-section__head" id={`${id}-h`}>
					{heading}
				</div>
				{children}
			</section>
		);
	}
	return (
		<section id={id} className={`ci-section ci-section--${kind}`} tabIndex={-1}>
			<details className="ci-section__details" open={startOpen}>
				<summary className="ci-section__head ci-section__head--toggle">{heading}</summary>
				{children}
			</details>
		</section>
	);
}

/** Jump to a section, opening it first if it is folded away. */
function goToSection(id: string) {
	const section = document.getElementById(id);
	if (!section) return;
	const details = section.querySelector("details");
	if (details) details.open = true;
	const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	section.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
	section.focus({ preventScroll: true });
}

/** What stood between the model's draft and the claims on this page, in plain words. */
function checkNote(brief: IntelligenceBrief): string {
	const base =
		"Press a number to see the words each claim rests on. Every quote was matched against its source.";
	const v = brief.verification;
	if (v.status !== "verified") return `${base} A second-model check did not run for this brief.`;
	if (v.checked === 0) return base;
	const outcome = [
		v.corrected > 0 ? `${v.corrected} ${v.corrected === 1 ? "was" : "were"} cut back to what the quote says` : "",
		v.removed > 0 ? `${v.removed} ${v.removed === 1 ? "was" : "were"} removed` : "",
	].filter(Boolean);
	return `${base} A second model then read ${v.checked} ${v.checked === 1 ? "claim" : "claims"} against ${v.checked === 1 ? "its quote" : "their quotes"}; ${outcome.length ? outcome.join(" and ") : "all passed"}.`;
}

const RISK_CLASS = { Low: "low", Medium: "medium", High: "high" } as const;

/**
 * One or two sentences that place the country for a reader who may not know
 * it: its region and its neighbours. The borders come from map data; nothing
 * is shown until the outlines load, or when the brief's country is not on the map.
 */
function WhereThisIs({ brief, countries }: { brief: IntelligenceBrief; countries: CountryIndex | null }) {
	const country = countries?.find(brief.location.country);
	if (!countries || !country) return null;
	const city = brief.location.city.trim();
	const pinned = typeof brief.location.lat === "number" && typeof brief.location.lng === "number";
	return (
		<p className="ci-where">
			{describeWhere(country, brief.location.region, countries.neighbours(country))}
			{pinned && city && city.toLowerCase() !== country.name.toLowerCase()
				? ` The pin marks ${city}, the main place in this brief.`
				: ""}
		</p>
	);
}

/** A finished brief. The page address is its permanent link. */
export function BriefView({ brief: briefData }: { brief: IntelligenceBrief }) {
	const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
	const copyLink = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(window.location.href);
			setCopyState("copied");
		} catch {
			// Clipboard blocked by the browser: say so, the address bar still holds the link.
			setCopyState("failed");
		}
		window.setTimeout(() => setCopyState("idle"), 3000);
	}, []);

	const titleRef = useRef<HTMLHeadingElement | null>(null);
	useEffect(() => {
		document.title = `${briefData.headline} · Vantage`;
		titleRef.current?.focus();
	}, [briefData.id, briefData.headline]);


	const countries = useCountries();
	const [showEvent, setShowEvent] = useState<{ index: number; at: number } | null>(null);
	const conflict = isConflictBrief(briefData);
	const mapped = showsMap(briefData);
	const modules = moduleSections(briefData);
	// Events the map can show: a confirmed pin, or a place that is a whole country it shades.
	const showOnMap = briefData.relatedEvents.map((evt, index) =>
		mapped && (eventPoint(evt) || countries?.find(evt.place))
			? () => {
					goToSection("map");
					setShowEvent({ index, at: Date.now() });
				}
			: null,
	);

	// Each defined term is explained once on the page, at its first appearance.
	const termsShown = new Set<string>();
	const hasOrientation = Boolean(briefData.orientation?.inScope);
	const hasNumbers = bigNumbers(briefData.keyFacts).length > 0;
	const analysis = adaptBrief(briefData);
	const regionBits = analysis.region.split("·").map((s) => s.trim());
	const regionBadge = regionBits[0] ?? "";
	const regionSubtitle =
		regionBits.slice(1).join(" · ").trim() || analysis.location;
	const hasComparison =
		briefData.coverage.agreements.length > 0 || briefData.coverage.differences.length > 0;

	// Three layers, each a step deeper: orientation, then the checked facts, then background.
	const nav: { id: string; label: string }[] = [
		{ id: "layer-orient", label: "In 30 seconds" },
		{ id: "layer-facts", label: "The facts" },
		{ id: "layer-deeper", label: "Go deeper" },
		{ id: "sources", label: `Sources (${briefData.sources.length})` },
	];

	return (
		<Shell status={`Brief ready: ${analysis.title}`}>
			<div className="ci-page">
				<div className="ci-wrap">
					<header className="ci-hero">
						<div className="ci-hero__region-row">
							{regionBadge ? (
								<span className="ci-hero__badge">{regionBadge}</span>
							) : null}
							<span className="ci-hero__locations">{regionSubtitle}</span>
						</div>

						<h1 ref={titleRef} tabIndex={-1} className="ci-hero__title">
							{analysis.title}
						</h1>

						<p className="ci-hero__meta">
							Generated {formatPublishedAt(analysis.publishedAt)}
							<span aria-hidden> · </span>
							{analysis.coverage.articles}{" "}
							{analysis.coverage.articles === 1 ? "article" : "articles"} retrieved
							{analysis.coverage.outlets > 0
								? ` from ${analysis.coverage.outlets} ${analysis.coverage.outlets === 1 ? "outlet" : "outlets"}`
								: ""}
							<span aria-hidden> · </span>
							AI-generated with Claude
						</p>

						<div className="ci-actions">
							<Link href="/" className="ci-actions__btn">
								New search
							</Link>
							<button
								type="button"
								className="ci-actions__btn"
								onClick={copyLink}
								aria-live="polite"
							>
								{copyState === "copied"
									? "Link copied"
									: copyState === "failed"
										? "Copy from the address bar"
										: "Copy link"}
							</button>
							<a
								href={reportUrl(briefData)}
								target="_blank"
								rel="noopener noreferrer"
								className="ci-actions__btn"
								aria-label="Report a problem (opens GitHub in a new tab)"
							>
								Report<span className="ci-actions__more"> a problem</span>
								<span className="sr-only"> (opens GitHub in a new tab)</span>
							</a>
						</div>
						{temporaryLinkNotice(briefData) && (
							<p className="ci-section__note" role="note">
								{temporaryLinkNotice(briefData)}
							</p>
						)}
					</header>

					<nav className="ci-nav" aria-label="Sections of this brief">
						<ul className="ci-nav__list">
							{nav.map((item) => (
								<li key={item.id}>
									<a
										href={`#${item.id}`}
										className="ci-nav__link"
										onClick={(e) => {
											e.preventDefault();
											goToSection(item.id);
										}}
									>
										{item.label}
									</a>
								</li>
							))}
						</ul>
					</nav>

					<div className="ci-layers">
						<section id="layer-orient" className="ci-layer" aria-labelledby="layer-orient-h" tabIndex={-1}>
							<h2 className="ci-layer__title" id="layer-orient-h">
								In 30 seconds
							</h2>
							{/* The orientation already says what happened; the longer summary then moves to Go deeper. */}
							{hasOrientation ? (
								<InThirtySeconds orientation={briefData.orientation} titled={false} glossary={briefData.glossary} used={termsShown} />
							) : (
								<Section id="summary" title="What happened" kind="background" startOpen>
									<p className="ci-summary">
										<TermText text={analysis.summary} glossary={briefData.glossary} used={termsShown} />
									</p>
								</Section>
							)}
							{hasNumbers ? (
								<Section id="numbers" title="Key numbers" kind="sourced" startOpen>
									<KeyNumbers keyFacts={briefData.keyFacts} sources={briefData.sources} />
								</Section>
							) : null}
							<PartiesPanel parties={analysis.parties} />
							{mapped ? (
								<Section id="map" title="Where this is" kind="background" startOpen>
									<WhereThisIs brief={briefData} countries={countries} />
									<div className="ci-map-outer">
										<InteractiveConflictMap data={briefData} active={true} showEvent={showEvent} />
									</div>
									<p className="ci-section__note">
										The shaded country and its borders come from Natural Earth map data.
										Pins mark places the model named, drawn only where a map lookup
										confirms them or on the sea or strait they name.
									</p>
								</Section>
							) : null}
						</section>

						<section id="layer-facts" className="ci-layer" aria-labelledby="layer-facts-h" tabIndex={-1}>
							<h2 className="ci-layer__title" id="layer-facts-h">
								The facts
							</h2>
							<p className="ci-layer__lede">From reporting retrieved for this brief. Every statement quotes its source.</p>
							<ReadingKey />
							<Section id="key-facts" title="Key facts" kind="sourced" startOpen>
								<p className="ci-section__note">{checkNote(briefData)}</p>
								<ClaimList
									claims={briefData.keyFacts}
									sources={briefData.sources}
									empty="Nothing in the retrieved sources could be tied to a specific claim, so none is shown."
								/>
							</Section>
							{modules.map((section) => (
								<Section key={section.id} id={section.id} title={section.title} kind="sourced" startOpen>
									<ModuleBody section={section} sources={briefData.sources} />
								</Section>
							))}
							{hasComparison && (
								<Section id="coverage" title="How coverage compares" kind="sourced" startOpen>
									<div className="ci-compare">
										<div>
											<h4 className="ci-compare__head">Where outlets agree</h4>
											<ClaimList
												claims={briefData.coverage.agreements}
												sources={briefData.sources}
												empty="No shared point was found across the retrieved outlets."
											/>
										</div>
										<div>
											<h4 className="ci-compare__head">Where framing differs</h4>
											<ClaimList
												claims={briefData.coverage.differences}
												sources={briefData.sources}
												empty="No clear difference in framing was found."
											/>
										</div>
									</div>
								</Section>
							)}
							<Section id="sources" title={`Sources (${briefData.sources.length})`} kind="retrieved" collapsible startOpen={false}>
								<RetrievalSummary retrieval={briefData.retrieval} />
								<SourceList sources={briefData.sources} />
							</Section>
						</section>

						<section id="layer-deeper" className="ci-layer" aria-labelledby="layer-deeper-h" tabIndex={-1}>
							<h2 className="ci-layer__title" id="layer-deeper-h">
								Go deeper
							</h2>
							<p className="ci-layer__lede">Background from the model&apos;s general knowledge. Tap a heading to open it.</p>
							{hasOrientation ? (
								<Section id="summary" title="The fuller summary" kind="background" collapsible startOpen={false}>
									<p className="ci-summary">
										<TermText text={analysis.summary} glossary={briefData.glossary} used={termsShown} />
									</p>
								</Section>
							) : null}
							{briefData.escalationRisk || analysis.keyQuestion ? (
								<Section id="assessment" title={conflict ? "Where this could go" : "What to watch"} kind="background" collapsible startOpen={false}>
									{briefData.escalationRisk ? (
										<p className="ci-assessment">
											<span className="ci-assessment__label">Escalation risk</span>{" "}
											<strong className={`ci-risk ci-risk--${RISK_CLASS[briefData.escalationRisk]}`}>
												{briefData.escalationRisk}
											</strong>
											{analysis.escalationTag ? (
												<span className="ci-assessment__reason"> — {analysis.escalationTag}</span>
											) : null}
										</p>
									) : null}
									{analysis.keyQuestion ? (
										<p className="ci-assessment">
											<span className="ci-assessment__label">Open question</span>{" "}
											<span className="ci-assessment__reason">{analysis.keyQuestion}</span>
										</p>
									) : null}
								</Section>
							) : null}
							<Section id="timeline" title="How we got here" kind="background" collapsible startOpen={false}>
								<EventTimeline events={briefData.relatedEvents} active={true} onShowOnMap={showOnMap} />
							</Section>
							{briefData.stakeholders?.length ? (
								<Section id="stakeholders" title="Where each one stands" kind="background" collapsible startOpen={false}>
									<StakeholderList stakeholders={briefData.stakeholders} />
								</Section>
							) : null}
							{briefData.perspectives?.length ? (
								<Section id="perspectives" title="How each side sees it" kind="background" collapsible startOpen={false}>
									<PerspectivesPanel perspectives={briefData.perspectives} active={true} />
								</Section>
							) : null}
							{briefData.casualtyData && (
								<Section id="population" title="People affected" kind="background" collapsible startOpen={false}>
									<CasualtyPanel data={briefData.casualtyData} active={true} />
								</Section>
							)}
							{briefData.glossary?.length ? (
								<Section id="words" title="Words to know" kind="background" collapsible startOpen={false}>
									<WordsToKnow glossary={briefData.glossary} />
								</Section>
							) : null}
							<Section id="context" title="History" kind="background" collapsible startOpen={false}>
								<ConflictBackground text={analysis.historicalContext} active={true} />
							</Section>
						</section>
					</div>

					<p className="ci-footnote">
						{analysis.credit}. This page is a saved copy: it shows the brief exactly
						as generated and does not update.
					</p>
				</div>
			</div>
		</Shell>
	);
}
