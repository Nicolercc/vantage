import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Orientation, RetrievalStatus, Source } from "@workspace/api-client-react";
import type { BriefRequest } from "@/lib/brief-request";
import { PlaceMap } from "./map/PlaceMap";
import { describeTextPlace, placeFromText } from "./map/orient";
import { useCountries } from "./map/useCountries";
import { freshness, requestLabel } from "./analysis-loader-format";
import { InThirtySeconds } from "./InThirtySeconds";
import "./AnalysisLoader.css";

type Stage = "retrieving" | "writing" | "checking" | "locating";

/** What the server does for every brief, in order. The current one is reported by the server. */
export const STEPS: { stage: Stage; short: string; label: string }[] = [
	{ stage: "retrieving", short: "Find", label: "Finding recent reporting" },
	{ stage: "writing", short: "Write", label: "Writing the brief, quoting a source for every fact" },
	{ stage: "checking", short: "Check", label: "Checking each quote against its source" },
	{ stage: "locating", short: "Map", label: "Placing events on the map" },
];

const NOTES = [
	"Two independent sources beat one loud headline.",
	"Dates matter: casualty counts and front lines go stale in hours.",
	"When the sides disagree, Vantage shows both and says who said what.",
];

function formatElapsed(totalSec: number) {
	const m = Math.floor(totalSec / 60);
	const s = totalSec % 60;
	return `${m}:${s.toString().padStart(2, "0")}`;
}

function Card({ title, children, delay = 0 }: { title: string; children: ReactNode; delay?: number }) {
	const reduce = useReducedMotion();
	return (
		<motion.section
			className="al-card"
			aria-label={title}
			initial={reduce ? false : { opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay }}
		>
			<h2 className="al-card__title">{title}</h2>
			{children}
		</motion.section>
	);
}

/**
 * The page while a brief is built. Nothing on it waits for the model: the
 * place comes from the search's own words and the map data, the steps from
 * the server's progress events, and the sources as soon as they are found.
 */
export function AnalysisLoader({
	request,
	stage,
	sources,
	retrieval,
	extra,
	orientation,
}: {
	request: BriefRequest;
	/** The step the server says it is on; null until it reports one. */
	stage: Stage | null;
	/** The sources retrieval found; null until retrieval finishes. */
	sources: Source[] | null;
	retrieval: RetrievalStatus[];
	/** Anything that arrives before the brief, shown at the top. */
	extra?: ReactNode;
	orientation?: Orientation | null;
}) {
	const reduce = useReducedMotion();
	const countries = useCountries();
	const text = request.kind === "topic" ? request.topic : orientation?.inScope ? orientation.where : "";
	const place = useMemo(() => placeFromText(text, countries), [text, countries]);
	const where = countries ? describeTextPlace(place, countries) : null;
	const stageIndex = Math.max(0, STEPS.findIndex((s) => s.stage === stage));
	const outlets = sources ? new Set(sources.map((s) => s.publisher)).size : 0;
	const unreachable = retrieval.filter((r) => r.status === "failed").length;

	const [elapsedSec, setElapsedSec] = useState(0);
	const [noteIdx, setNoteIdx] = useState(0);
	useEffect(() => {
		const start = performance.now();
		const tick = window.setInterval(() => setElapsedSec(Math.floor((performance.now() - start) / 1000)), 1000);
		const note = window.setInterval(() => setNoteIdx((i) => (i + 1) % NOTES.length), 8000);
		return () => {
			clearInterval(tick);
			clearInterval(note);
		};
	}, []);

	return (
		<div className="al">
			<div className="al__inner">
				<header className="al__head">
					<p className="al__eyebrow">
						Building your brief <span aria-hidden>·</span> <span className="al__clock">{formatElapsed(elapsedSec)}</span>
					</p>
					<h1 className="al__title">{requestLabel(request)}</h1>

					<ol className="al-steps" aria-label="Progress">
						{STEPS.map((step, i) => {
							const state = stage === null ? (i === 0 ? "current" : "todo") : i < stageIndex ? "done" : i === stageIndex ? "current" : "todo";
							return (
								<li key={step.stage} className={`al-steps__step al-steps__step--${state}`} aria-current={state === "current" ? "step" : undefined}>
									<span className="al-steps__dot" aria-hidden>
										{state === "done" ? "✓" : i + 1}
									</span>
									<span className="al-steps__short">{step.short}</span>
									<span className="sr-only">
										: {step.label}
										{state === "done" ? " (done)" : state === "current" ? " (in progress)" : ""}
									</span>
								</li>
							);
						})}
					</ol>
					<p className="al__now" aria-live="polite">
						{STEPS[stage === null ? 0 : stageIndex].label}…
					</p>
					<p className="al__lede">
						Usually under a minute. The first search after a quiet spell takes longer while the server wakes up.
					</p>
				</header>

				<div className="al__grid">
					<div className="al__col">
						{extra}
						<AnimatePresence>
							{orientation?.inScope && (
								<motion.div key="orientation" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}>
									<InThirtySeconds orientation={orientation} />
								</motion.div>
							)}
						</AnimatePresence>
						{!orientation && (sources === null || elapsedSec < 10) && (
							<div className="al-card" aria-hidden="true">
								<p className="al-card__title">In 30 seconds</p>
								<div className="al-skeleton"><span /></div>
							</div>
						)}
						{where && countries ? (
							<Card title="Where this is">
								<PlaceMap country={place.country} water={place.water} countries={countries} />
								<p className="al-card__text">{where}</p>
								<p className="al-card__note">From map data, before any AI writing.</p>
							</Card>
						) : null}
					</div>

					<div className="al__col">
						<Card title={sources === null ? "Looking for reporting" : sources.length === 0 ? "No recent reporting found" : `Reading ${sources.length} ${sources.length === 1 ? "source" : "sources"} from ${outlets} ${outlets === 1 ? "outlet" : "outlets"}`} delay={0.05}>
							{sources === null ? (
								<div className="al-skeleton" aria-hidden>
									<span />
									<span />
									<span />
								</div>
							) : sources.length === 0 ? (
								<p className="al-card__text">The brief will rest on background knowledge and will say so.</p>
							) : (
								<ul className="al-sources">
									<AnimatePresence initial={!reduce}>
										{sources.slice(0, 6).map((s, i) => (
											<motion.li
												key={s.id}
												className="al-sources__item"
												initial={reduce ? false : { opacity: 0, x: -8 }}
												animate={{ opacity: 1, x: 0 }}
												transition={{ duration: 0.3, delay: reduce ? 0 : i * 0.08 }}
											>
												<span className="al-sources__publisher">{s.publisher}</span>
												<span className="al-sources__title">{s.title}</span>
												{freshness(s.publishedAt) ? <span className="al-sources__when">{freshness(s.publishedAt)}</span> : null}
											</motion.li>
										))}
									</AnimatePresence>
								</ul>
							)}
							{sources && sources.length > 6 ? <p className="al-card__note">and {sources.length - 6} more</p> : null}
							{unreachable > 0 ? (
								<p className="al-card__note">
									{unreachable} {unreachable === 1 ? "news service" : "news services"} could not be reached.
								</p>
							) : null}
						</Card>

						{!where ? (
							<Card title="Good to know" delay={0.1}>
								<p className="al-card__text">{NOTES[noteIdx]}</p>
							</Card>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}
