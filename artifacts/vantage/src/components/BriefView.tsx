import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
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
import { newsCount, reportUrl, sourceBreakdown } from "@/lib/brief-labels";
import { ClaimList, RetrievalSummary, SourceList } from "./Evidence";
import { adaptBrief } from "./conflict/adapter";
import { PartiesPanel } from "./PartiesPanel";
import { describeWhere, type CountryIndex } from "./map/countries";
import { useCountries } from "./map/useCountries";
import { eventPoint } from "./map/places";
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
/** A reviewed sample shipped with the site: dated in UTC and never updated. */
export type SampleInfo = { date: string };

export function BriefView({ brief: briefData, sample }: { brief: IntelligenceBrief; sample?: SampleInfo }) {
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
	// Events the map can show: a confirmed pin, or a place that is a whole country it shades.
	const showOnMap = briefData.relatedEvents.map((evt, index) =>
		eventPoint(evt) || countries?.find(evt.place)
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
		{ id: "layer-context", label: "Who and where" },
		{ id: "layer-deeper", label: "Go deeper" },
		{ id: "sources", label: `Sources (${briefData.sources.length})` },
	];

	return (
		<Shell status={`Brief ready: ${analysis.title}`}>
			<div className="ci-page">
				<div className="ci-wrap">
					<header className="ci-hero">
						{sample ? (
							<p className="ci-sample-banner" role="note">
								Reviewed sample from {sample.date} · doesn&apos;t update
							</p>
						) : null}
						<div className="ci-hero__region-row">
							{regionBadge ? (
								<span className="ci-hero__badge">{regionBadge}</span>
							) : null}
							<span className="ci-hero__locations">{regionSubtitle}</span>
							<button
								type="button"
								className="ci-actions__btn ci-hero__share"
								onClick={copyLink}
								aria-live="polite"
								aria-label={copyState === "copied" ? "Link copied" : "Share this brief"}
							>
								{copyState === "copied" ? "Link copied" : copyState === "failed" ? "Copy from the address bar" : "Share"}
							</button>
						</div>

						<h1 ref={titleRef} tabIndex={-1} className="ci-hero__title">
							{analysis.title}
						</h1>

						<p className="ci-hero__meta">
							{sample ? sample.date : `Generated ${formatPublishedAt(analysis.publishedAt)}`}
							<span aria-hidden> · </span>
							{newsCount(analysis.coverage.articles, analysis.coverage.outlets)}
							<span aria-hidden> · </span>
							Written by AI with Claude, facts checked against sources
						</p>

						{!sample && temporaryLinkNotice(briefData) && (
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
							<h2 className="ci-layer__title ci-layer__title--marked" id="layer-orient-h">
								In 30 seconds
								{hasOrientation ? (
									<span className="ci-layer__mark">
										<KindMark kind="background" /> AI background
									</span>
								) : null}
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
						</section>

						<section id="layer-facts" className="ci-layer" aria-labelledby="layer-facts-h" tabIndex={-1}>
							<h2 className="ci-layer__title" id="layer-facts-h">
								The facts
							</h2>
							<Section id="key-facts" title="From news reports, each quote checked against its source" kind="sourced" startOpen>
								<ClaimList
									claims={briefData.keyFacts}
									sources={briefData.sources}
									empty="Nothing in the retrieved sources could be tied to a specific claim, so none is shown."
								/>
								<p className="ci-section__note">{checkNote(briefData)}</p>
								{hasNumbers ? <KeyNumbers keyFacts={briefData.keyFacts} sources={briefData.sources} /> : null}
							</Section>
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
								<p className="ci-section__note">{sourceBreakdown(briefData)}</p>
								<RetrievalSummary retrieval={briefData.retrieval} />
								<SourceList sources={briefData.sources} />
							</Section>
							<ReadingKey />
						</section>

						{/* After the answer and its proof: who is involved and where it is. */}
						<section id="layer-context" className="ci-layer" aria-labelledby="layer-context-h" tabIndex={-1}>
							<h2 className="ci-layer__title" id="layer-context-h">
								Who and where
							</h2>
							<PartiesPanel parties={analysis.parties} />
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
							<Section id="assessment" title="Where this could go" kind="background" collapsible startOpen={false}>
								<p className="ci-assessment">
									<span className="ci-assessment__label">Escalation risk</span>{" "}
									<strong className={`ci-risk ci-risk--${RISK_CLASS[briefData.escalationRisk]}`}>
										{briefData.escalationRisk}
									</strong>
									<span className="ci-assessment__reason"> — {analysis.escalationTag}</span>
								</p>
								{analysis.keyQuestion ? (
									<p className="ci-assessment">
										<span className="ci-assessment__label">Open question</span>{" "}
										<span className="ci-assessment__reason">{analysis.keyQuestion}</span>
									</p>
								) : null}
							</Section>
							<Section id="timeline" title="How we got here" kind="background" collapsible startOpen={false}>
								<EventTimeline events={briefData.relatedEvents} active={true} onShowOnMap={showOnMap} />
							</Section>
							<Section id="perspectives" title="How each side sees it" kind="background" collapsible startOpen={false}>
								<PerspectivesPanel perspectives={briefData.perspectives} active={true} />
							</Section>
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
						as generated and does not update.{" "}
						<a href={reportUrl(briefData)} target="_blank" rel="noopener noreferrer">
							Report a problem with this brief<span className="sr-only"> (opens GitHub in a new tab)</span>
						</a>
					</p>
				</div>
			</div>
		</Shell>
	);
}
