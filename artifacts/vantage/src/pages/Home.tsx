import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { ShieldCheck, MapPinned, Clock3 } from "lucide-react";
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
	homeTopics,
	isReady,
	todayHref,
	TODAY_VISIBLE,
	type HomeTopics,
} from "@/lib/trending";
import { isStale, latestSample, sampleDate } from "@/samples";
import "./HomePage.css";

type Mode = BriefRequest["kind"];

// Text is readable from the first frame; only a short rise is animated.
const fadeUp = {
	initial: { opacity: 1, y: 8 },
	animate: { opacity: 1, y: 0 },
};

/**
 * The ready sample, first: one tap opens a finished brief with no wait. Its
 * card shows the same headline and reason to care as the page it opens.
 */
function StartHere() {
	const sample = latestSample();
	if (!sample) return null;
	const old = isStale(sample.generatedAt);
	return (
		<section className="home-start" aria-labelledby="start-title">
			<h2 id="start-title" className="home-label">
				Start here
			</h2>
			<Link href={`/sample/${sample.slug}`} className="home-start__card">
				<span className="home-start__meta">
					<span className={`home-start__pill${old ? " home-start__pill--old" : ""}`}>
						{old ? "More than two weeks old" : "Ready"}
					</span>
					<span>
						{sample.country} · {sampleDate(sample.generatedAt)}
					</span>
				</span>
				<span className="home-start__headline">{sample.headline}</span>
				<span className="home-start__why">{sample.why}</span>
				<span className="home-start__go">
					Read in about a minute <span aria-hidden="true">→</span>
				</span>
			</Link>
		</section>
	);
}

/**
 * Today's most covered places, after the ready story. Until stories have
 * their own briefs, a row opens a fresh brief on the whole place, and says so.
 */
function TodayRows({ offer }: { offer: Extract<HomeTopics, { kind: "loading" | "today" }> }) {
	const [expanded, setExpanded] = useState(false);
	if (offer.kind === "loading") {
		return (
			<section className="home-today" aria-labelledby="today-title" aria-busy="true">
				<h2 id="today-title" className="home-label">
					More from today&apos;s coverage
				</h2>
				<p className="sr-only" role="status">
					Loading today&apos;s most covered topics
				</p>
				<ul className="home-today__rows" aria-hidden>
					{Array.from({ length: 3 }, (_, i) => (
						<li key={i} className="home-today__row home-today__row--placeholder" />
					))}
				</ul>
			</section>
		);
	}
	const shown = expanded ? offer.topics : offer.topics.slice(0, TODAY_VISIBLE);
	const hidden = offer.topics.length - shown.length;
	return (
		<section className="home-today" aria-labelledby="today-title">
			<h2 id="today-title" className="home-label">
				More from today&apos;s coverage
			</h2>
			<ul className="home-today__rows" id="today-list">
				{shown.map((t) => (
					<li key={t.label}>
						<Link href={todayHref(t)} className="home-today__row">
							<span className="home-today__what">Explore coverage of {t.label}</span>
							<span className="home-today__when">{isReady(t) ? "Ready" : "about a minute"}</span>
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

	// Topic search is the default; pasting an article is one link away.
	const changeMode = (next: Mode) => {
		setMode(next);
		setProblem(null);
		window.setTimeout(() => document.getElementById("search-input")?.focus(), 0);
	};

	const applyQuickTopic = (q: string) => {
		setMode("topic");
		setValue(q);
		setProblem(null);
		document.getElementById("search-input")?.focus();
	};

	const inputLabel = mode === "article" ? "Article text" : "Ask about a story";

	return (
		<div className="home">
			<SiteHeader />

			<main>
				<section className="home-hero" aria-labelledby="home-hero-title">
					<div className="home-hero__mesh" aria-hidden />
					<div className="home-hero__grain" aria-hidden />
					<div className="home-hero__inner">
						<div id="search">
							<motion.h1
								id="home-hero-title"
								className="home-title"
								{...fadeUp}
								transition={{ ...transition, delay: 0 }}
							>
								Understand what&apos;s happening.
							</motion.h1>
							<p className="home-lead">
								World news explained in plain words, with every fact tied to its source.
							</p>
							<form className="home-search" onSubmit={handleSubmit} role="search" noValidate>
								<label htmlFor="search-input" className="sr-only">
									{inputLabel}
								</label>
								<div className={`home-search__row${mode === "article" ? " home-search__row--stack" : ""}`}>
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
										<input
											id="search-input"
											className="home-search__input"
											type="search"
											value={value}
											onChange={(e) => {
												setValue(e.currentTarget.value);
												setProblem(null);
											}}
											placeholder="Ask about a story"
											autoComplete="off"
											autoCapitalize="sentences"
											enterKeyHint="search"
											aria-invalid={problem ? true : undefined}
											aria-describedby="search-help"
										/>
									)}
									<button type="submit" className="home-search__submit">
										Explain
									</button>
								</div>
								<div id="search-help">
									{problem ? (
										<p className="home-search__error" role="alert">
											{problem}
										</p>
									) : mode === "article" ? (
										<p className="home-search__hint">
											Up to {ARTICLE_MAX.toLocaleString()} characters · Pasted text stays out of the page address
										</p>
									) : null}
								</div>
								<button
									type="button"
									className="home-paste"
									onClick={() => changeMode(mode === "article" ? "topic" : "article")}
								>
									{mode === "article" ? "Ask about a story instead" : "Have an article? Paste it"}
								</button>
							</form>
						</div>

						<StartHere />

						{offer.kind === "examples" ? (
							<div className="home-chips" role="group" aria-labelledby="try-title">
								<p id="try-title" className="home-label">
									Try a topic
								</p>
								{offer.topics.map((q) => (
									<button key={q} type="button" className="home-chip" onClick={() => applyQuickTopic(q)}>
										{q}
									</button>
								))}
							</div>
						) : (
							<TodayRows offer={offer} />
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
