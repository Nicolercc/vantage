import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { Search, ShieldCheck, MapPinned, Clock3 } from "lucide-react";
import { getGetTrendingQueryKey, useGetTrending } from "@workspace/api-client-react";
import { SiteHeader } from "@/components/LiveTicker";
import {
	briefPath,
	looksLikeUrl,
	validateBriefInput,
	ARTICLE_MAX,
	type BriefRequest,
} from "@/lib/brief-request";
import {
	cardLabel,
	homeTopics,
	isReady,
	timeAgo,
	todayCaption,
	todayHref,
	TODAY_VISIBLE,
	type HomeTopics,
} from "@/lib/trending";
import "./HomePage.css";

type Mode = BriefRequest["kind"];

const MODES: { id: Mode; label: string }[] = [
	{ id: "topic", label: "Topic" },
	{ id: "url", label: "Article link" },
	{ id: "article", label: "Paste text" },
];

// Text is readable from the first frame; only a short rise is animated.
const fadeUp = {
	initial: { opacity: 1, y: 8 },
	animate: { opacity: 1, y: 0 },
};

/** Today's most covered topics, as links to their briefs. */
function TodaySection({ offer }: { offer: Extract<HomeTopics, { kind: "loading" | "today" }> }) {
	const [expanded, setExpanded] = useState(false);
	if (offer.kind === "loading") {
		return (
			<section className="home-today" aria-labelledby="today-title" aria-busy="true">
				<h2 id="today-title" className="home-today__title">
					Today
				</h2>
				<p className="sr-only" role="status">
					Loading today&apos;s most covered topics
				</p>
				<ul className="home-today__list" aria-hidden>
					{Array.from({ length: TODAY_VISIBLE }, (_, i) => (
						<li key={i} className="home-today__card home-today__card--placeholder" />
					))}
				</ul>
			</section>
		);
	}
	const now = Date.now();
	const shown = expanded ? offer.topics : offer.topics.slice(0, TODAY_VISIBLE);
	const hidden = offer.topics.length - shown.length;
	return (
		<section className="home-today" aria-labelledby="today-title">
			<h2 id="today-title" className="home-today__title">
				Today
			</h2>
			<p className="home-today__caption">{todayCaption(offer.outletCount)}</p>
			<ul className="home-today__list" id="today-list">
				{shown.map((t) => (
					<li key={t.label}>
						<Link href={todayHref(t)} className="home-today__card" aria-label={cardLabel(t, now)}>
							<span className="home-today__head">
								<span className="home-today__label">{t.label}</span>
								<span className={`home-today__badge${isReady(t) ? " home-today__badge--ready" : ""}`}>
									{isReady(t) ? "Ready" : "About a minute"}
								</span>
							</span>
							{t.country !== t.label && <span className="home-today__country">{t.country}</span>}
							<span className="home-today__headline">{t.headline.title}</span>
							<span className="home-today__meta">
								{t.outletCount} outlets · newest <time dateTime={t.newestAt}>{timeAgo(t.newestAt, now)}</time>
							</span>
						</Link>
					</li>
				))}
			</ul>
			{offer.topics.length > TODAY_VISIBLE && (
				<button
					type="button"
					className="home-today__more"
					aria-expanded={expanded}
					aria-controls="today-list"
					onClick={() => setExpanded((e) => !e)}
				>
					{expanded ? "Show fewer" : `Show ${hidden} more`}
				</button>
			)}
		</section>
	);
}

export function Home() {
	const [mode, setMode] = useState<Mode>("topic");
	const [value, setValue] = useState("");
	const [problem, setProblem] = useState<string | null>(null);
	const [, setLocation] = useLocation();
	const reduceMotion = useReducedMotion();
	const trending = useGetTrending({
		query: {
			queryKey: getGetTrendingQueryKey(),
			staleTime: 60_000,
			// A tab left open keeps up with the ranking, which refreshes hourly.
			refetchInterval: 10 * 60_000,
			retry: 1,
		},
	});
	const offer = homeTopics(trending);

	const transition = reduceMotion
		? { duration: 0 }
		: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const };

	useEffect(() => {
		document.title = "Vantage — conflict, in context";
		// Wake the API while the reader types; a sleeping server otherwise adds
		// its whole start-up time to the first brief.
		const base = import.meta.env.VITE_API_BASE_URL || "";
		fetch(`${base}/api/healthz`).catch(() => {});
	}, []);

	useEffect(() => {
		const html = document.documentElement;
		const prevBehavior = html.style.scrollBehavior;
		const prevPaddingTop = html.style.scrollPaddingTop;
		html.style.scrollPaddingTop = "56px";
		if (!reduceMotion) {
			html.style.scrollBehavior = "smooth";
		}
		return () => {
			html.style.scrollBehavior = prevBehavior;
			html.style.scrollPaddingTop = prevPaddingTop;
		};
	}, [reduceMotion]);

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const input = value.trim();
		// A link typed into the topic box is still a link.
		const effective: Mode =
			mode === "topic" && looksLikeUrl(input) ? "url" : mode;
		const issue = validateBriefInput(effective, input);
		if (issue) {
			setProblem(issue);
			document.getElementById("search-input")?.focus();
			return;
		}
		setProblem(null);
		const request: BriefRequest =
			effective === "topic"
				? { kind: "topic", topic: input }
				: effective === "url"
					? { kind: "url", url: input }
					: { kind: "article", text: input };
		setLocation(briefPath(request));
	};

	const changeMode = (next: Mode) => {
		setMode(next);
		setProblem(null);
	};

	const applyQuickTopic = (q: string) => {
		setMode("topic");
		setValue(q);
		setProblem(null);
		document.getElementById("search-input")?.focus();
	};

	const inputLabel =
		mode === "topic"
			? "Conflict, crisis or country to brief"
			: mode === "url"
				? "Link to a news article"
				: "Article text";

	return (
		<div className="home">
			<SiteHeader />

			<main>
				<section className="home-hero" aria-labelledby="home-hero-title">
					<div className="home-hero__mesh" aria-hidden />
					<div className="home-hero__grain" aria-hidden />
					<div className="home-hero__inner">
						<div id="search">
							<motion.p
								className="home-kicker"
								{...fadeUp}
								transition={{ ...transition, delay: reduceMotion ? 0 : 0.05 }}
							>
								<span className="home-kicker__dot" aria-hidden />
								For reporters, editors &amp; engaged citizens
							</motion.p>

							<motion.h1
								id="home-hero-title"
								className="home-title"
								{...fadeUp}
								transition={{ ...transition, delay: reduceMotion ? 0 : 0.12 }}
							>
								See the full story behind the headline.
							</motion.h1>

							<motion.p
								className="home-lead"
								{...fadeUp}
								transition={{ ...transition, delay: reduceMotion ? 0 : 0.2 }}
							>
								Built for geopolitical conflicts, humanitarian crises, and regional
								tensions. Search a specific event — we assemble recent coverage,
								a background timeline, perspectives, and geography.
							</motion.p>

							{offer.kind !== "examples" && <TodaySection offer={offer} />}

							<form
								className="home-search"
								onSubmit={handleSubmit}
								role="search"
								noValidate
							>
								<div
									className="home-modes"
									role="radiogroup"
									aria-label="What do you want briefed?"
								>
									{MODES.map((m) => (
										<label
											key={m.id}
											className={`home-mode${mode === m.id ? " home-mode--on" : ""}`}
										>
											<input
												type="radio"
												name="mode"
												value={m.id}
												checked={mode === m.id}
												onChange={() => changeMode(m.id)}
											/>
											{m.label}
										</label>
									))}
								</div>

								<label htmlFor="search-input" className="sr-only">
									{inputLabel}
								</label>
								<div
									className={`home-search__row${mode === "article" ? " home-search__row--stack" : ""}`}
								>
									{mode === "article" ? (
										<textarea
											id="search-input"
											className="home-search__textarea"
											value={value}
											onChange={(e) => {
												setValue(e.currentTarget.value);
												setProblem(null);
											}}
											placeholder="Paste the full text of a news article…"
											rows={7}
											aria-invalid={problem ? true : undefined}
											aria-describedby="search-help"
										/>
									) : (
										<>
											<span className="home-search__icon" aria-hidden>
												<Search size={22} strokeWidth={2} />
											</span>
											<input
												id="search-input"
												className="home-search__input"
												type={mode === "url" ? "url" : "search"}
												inputMode={mode === "url" ? "url" : undefined}
												value={value}
												onChange={(e) => {
													setValue(e.currentTarget.value);
													setProblem(null);
												}}
												placeholder={
													mode === "url"
														? "https://…"
														: "e.g. Sudan, Red Sea, Gaza"
												}
												autoComplete="off"
												autoCapitalize={mode === "url" ? "off" : "sentences"}
												enterKeyHint="search"
												aria-invalid={problem ? true : undefined}
												aria-describedby="search-help"
											/>
										</>
									)}
									<button type="submit" className="home-search__submit">
										Explain this
									</button>
								</div>
								<div id="search-help">
									{problem ? (
										<p className="home-search__error" role="alert">
											{problem}
										</p>
									) : (
										<p className="home-search__hint">
											{mode === "topic"
												? "A conflict, crisis or country · No account needed"
												: mode === "url"
													? "We fetch the public page and brief that article"
													: `Up to ${ARTICLE_MAX.toLocaleString()} characters · Pasted text stays out of the page address`}
										</p>
									)}
								</div>
							</form>
						</div>

						{offer.kind === "examples" && (
							<div className="home-chips" aria-label="Example searches">
								<p
									style={{
										flexBasis: "100%",
										textAlign: "left",
										fontFamily: "var(--mono)",
										fontSize: "13px",
										textTransform: "uppercase",
										letterSpacing: ".08em",
										color: "var(--color-text-secondary)",
										marginBottom: "10px",
									}}
								>
									Try one of these →
								</p>
								{offer.topics.map((q) => (
									<button
										key={q}
										type="button"
										className="home-chip"
										onClick={() => applyQuickTopic(q)}
									>
										{q}
									</button>
								))}
							</div>
						)}
					</div>
				</section>

				<section
					id="features"
					className="home-band"
					aria-labelledby="features-title"
				>
					<div className="home-band__inner">
						<header className="home-band__head">
							<p className="home-band__label">What you get</p>
							<p
								style={{
									fontSize: "clamp(15px, 1.8vw, 17px)",
									lineHeight: 1.6,
									color: "var(--text-secondary)",
									maxWidth: "36rem",
									margin: "0 auto 12px",
								}}
							>
								Search a specific conflict, humanitarian crisis, or geopolitical
								event.
							</p>
							<h2 id="features-title" className="home-band__title">
								Built for speed, anchored in evidence
							</h2>
						</header>

						<div className="home-features">
							<article className="home-feature">
								<div className="home-feature__icon" aria-hidden>
									<ShieldCheck size={22} strokeWidth={2} />
								</div>
								<h3 className="home-feature__title">Linked to real reporting</h3>
								<p className="home-feature__text">
									Every brief lists the recent articles it retrieved, with links to
									the originals, and says plainly what is AI-generated.
								</p>
							</article>
							<article className="home-feature">
								<div
									className="home-feature__icon home-feature__icon--teal"
									aria-hidden
								>
									<Clock3 size={22} strokeWidth={2} />
								</div>
								<h3 className="home-feature__title">Background in order</h3>
								<p className="home-feature__text">
									A short timeline of earlier events for context, labelled as the
									model&apos;s background and not as sourced reporting.
								</p>
							</article>
							<article className="home-feature">
								<div
									className="home-feature__icon home-feature__icon--blue"
									aria-hidden
								>
									<MapPinned size={22} strokeWidth={2} />
								</div>
								<h3 className="home-feature__title">Geography you can point to</h3>
								<p className="home-feature__text">
									The main location and related events on a map. Places the model
									cannot locate are left off, never guessed.
								</p>
							</article>
						</div>
					</div>
				</section>

				<section className="home-strip" aria-labelledby="strip-heading">
					<div className="home-strip__inner">
						<h2 id="strip-heading" className="sr-only">
							Our commitment
						</h2>
						<p className="home-strip__text">
							&quot;In a news cycle measured in seconds, context is a public good. This
							tool exists to give journalists and readers the same thing: clarity under
							pressure.&quot;
						</p>
						<p className="home-strip__meta">
							Designed for editorial rigor · Structured for civic understanding
						</p>
					</div>
				</section>
			</main>

			<footer className="home-footer">
				Vantage · Conflict intelligence in context
			</footer>
		</div>
	);
}
