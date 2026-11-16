import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type {
	Claim,
	RetrievalStatus,
	Source,
} from "@workspace/api-client-react";

const sourceAnchor = (id: string) => `source-${id}`;

function formatDate(iso: string | null) {
	if (!iso) return "date not given";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "date not given";
	return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/**
 * A citation number. Pressing it shows the source right where the claim is —
 * outlet, date, headline and the publisher's summary — so a reader can check
 * the claim without losing their place. The popover also links to the article
 * and to the entry in the source list.
 */
function Citation({ source, number, quote }: { source: Source; number: number; quote: string }) {
	const [open, setOpen] = useState(false);
	const wrapRef = useRef<HTMLSpanElement | null>(null);
	const popRef = useRef<HTMLSpanElement | null>(null);
	const popId = useId();

	// Close on Escape, and on a press or focus that lands outside.
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			setOpen(false);
			wrapRef.current?.querySelector("button")?.focus();
		};
		const onOutside = (e: Event) => {
			if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("keydown", onKey);
		document.addEventListener("pointerdown", onOutside);
		document.addEventListener("focusin", onOutside);
		return () => {
			document.removeEventListener("keydown", onKey);
			document.removeEventListener("pointerdown", onOutside);
			document.removeEventListener("focusin", onOutside);
		};
	}, [open]);

	// Keep the popover inside the screen: it opens under its number, then is
	// nudged sideways if that would push it past either edge.
	useLayoutEffect(() => {
		const pop = popRef.current;
		if (!open || !pop) return;
		pop.style.setProperty("--shift", "0px");
		const box = pop.getBoundingClientRect();
		const margin = 12;
		const over = box.right - (window.innerWidth - margin);
		const under = margin - box.left;
		pop.style.setProperty("--shift", `${over > 0 ? -over : under > 0 ? under : 0}px`);
	}, [open]);

	return (
		<span className="ci-cite-wrap" ref={wrapRef}>
			<button
				type="button"
				className="ci-cite"
				aria-label={`Source ${number}: ${source.publisher}`}
				aria-expanded={open}
				aria-controls={open ? popId : undefined}
				onClick={() => setOpen((v) => !v)}
			>
				{number}
			</button>
			{open && (
				<span className="ci-cite-pop" id={popId} ref={popRef} role="group" aria-label={`Source ${number}`}>
					<SourceBody source={source} quote={quote} onLeave={() => setOpen(false)} />
				</span>
			)}
		</span>
	);
}

/**
 * Show one source in the source list. The list sits in a folded section, so
 * open it first; otherwise the link scrolls to something hidden and seems dead.
 */
export function showSourceInList(id: string) {
	const entry = document.getElementById(sourceAnchor(id));
	if (!entry) return;
	const details = entry.closest("details");
	if (details) details.open = true;
	const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	entry.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
	entry.focus({ preventScroll: true });
}

/**
 * What a reader sees about one source behind a claim: outlet and date, the
 * exact words the claim rests on, the headline, and the way to the original.
 * Shared by the numbered pop-up and the inline "See source quote" panel, so
 * the two can never disagree.
 */
export function SourceBody({ source, quote, onLeave }: { source: Source; quote: string; onLeave?: () => void }) {
	return (
		<>
			<span className="ci-cite-pop__meta">
				<strong>{source.publisher}</strong>
				{source.country ? ` · ${source.country}` : ""}
				{source.kind === "news" ? ` · ${formatDate(source.publishedAt)}` : ""}
				{source.kind !== "news" ? ` · ${KIND_LABEL[source.kind]}` : ""}
			</span>
			{quote ? (
				<span className="ci-cite-pop__quote">
					<span className="ci-cite-pop__quote-label">The words this rests on</span>
					<q>{quote}</q>
				</span>
			) : null}
			<span className="ci-cite-pop__title">{source.title}</span>
			{quote ? null : source.excerpt ? (
				<span className="ci-cite-pop__excerpt">{source.excerpt}</span>
			) : (
				<span className="ci-cite-pop__excerpt ci-cite-pop__excerpt--none">
					{source.kind === "article"
						? "Checked against the text you supplied, which is not stored or shown."
						: "The publisher gave no summary for this item."}
				</span>
			)}
			<span className="ci-cite-pop__links">
				{source.url ? (
					<a href={source.url} target="_blank" rel="noopener noreferrer">
						Read the original on {source.publisher}
						<span className="sr-only"> (opens in a new tab)</span>
					</a>
				) : (
					<span className="ci-cite-pop__none">Original not available online</span>
				)}
				<a
					href={`#${sourceAnchor(source.id)}`}
					onClick={(e) => {
						e.preventDefault();
						onLeave?.();
						showSourceInList(source.id);
					}}
				>
					Show in source list
				</a>
			</span>
		</>
	);
}

/**
 * The quote to show for a claim, or null. Only a claim the second check
 * verified, and only words actually quoted from a source we can name: never
 * offer proof for text that wasn't checked.
 */
export function pickQuote(claim: Claim, sources: Source[]): { source: Source; quote: string } | null {
	if (claim.support !== "verified") return null;
	for (const id of claim.sourceIds) {
		const quote = claim.evidence.find((e) => e.sourceId === id)?.quote?.trim() ?? "";
		const source = sources.find((s) => s.id === id);
		if (quote && source) return { source, quote };
	}
	return null;
}

/**
 * "See source quote": a visible way to the evidence for one claim, opened in
 * place. A disclosure, so focus stays on the button and the panel follows it
 * in reading order; Escape or "Hide quote" closes it.
 */
export function QuoteDisclosure({ source, quote, startOpen = false }: { source: Source; quote: string; startOpen?: boolean }) {
	const [open, setOpen] = useState(startOpen);
	const buttonRef = useRef<HTMLButtonElement | null>(null);
	const panelId = useId();
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			setOpen(false);
			buttonRef.current?.focus();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open]);
	return (
		<div className="ci-quote">
			<button
				ref={buttonRef}
				type="button"
				className="ci-quote__toggle"
				aria-expanded={open}
				aria-controls={panelId}
				onClick={() => setOpen((v) => !v)}
			>
				See source quote <span aria-hidden="true">{open ? "▴" : "▾"}</span>
			</button>
			<div id={panelId} className="ci-quote__panel" role="region" aria-label="Source quote for this fact" hidden={!open}>
				<SourceBody source={source} quote={quote} />
				<button
					type="button"
					className="ci-quote__hide"
					onClick={() => {
						setOpen(false);
						buttonRef.current?.focus();
					}}
				>
					Hide quote
				</button>
			</div>
		</div>
	);
}

/** The numbered sources behind one claim, each with the words quoted from it. */
export function Citations({ claim, sources }: { claim: Claim; sources: Source[] }) {
	return (
		<span className="ci-cites">
			{claim.sourceIds.map((id) => {
				const index = sources.findIndex((s) => s.id === id);
				if (index === -1) return null;
				const quote = claim.evidence.find((e) => e.sourceId === id)?.quote ?? "";
				return <Citation key={id} source={sources[index]} number={index + 1} quote={quote} />;
			})}
		</span>
	);
}

export function ClaimList({
	claims,
	sources,
	empty,
	showQuoteFor,
}: {
	claims: Claim[];
	sources: Source[];
	empty: string;
	/** Give the first verified, quoted claim a visible "See source quote". Only the key facts opt in. */
	showQuoteFor?: "first-verified";
}) {
	if (claims.length === 0) {
		return <p className="ci-evidence-empty">{empty}</p>;
	}
	const quoteIndex = showQuoteFor ? claims.findIndex((c) => pickQuote(c, sources) !== null) : -1;
	const proof = quoteIndex >= 0 ? pickQuote(claims[quoteIndex], sources) : null;
	return (
		<ul className="ci-claims">
			{claims.map((claim, i) => (
				<li key={i} className="ci-claim">
					{claim.text} <Citations claim={claim} sources={sources} />
					{i === quoteIndex && proof ? <QuoteDisclosure source={proof.source} quote={proof.quote} /> : null}
				</li>
			))}
		</ul>
	);
}

const KIND_LABEL: Record<Source["kind"], string> = {
	news: "News",
	reference: "Background reference",
	article: "Supplied by you",
};

export function SourceList({ sources }: { sources: Source[] }) {
	if (sources.length === 0) {
		return (
			<p className="ci-evidence-empty">
				No sources were retrieved for this brief.
			</p>
		);
	}
	return (
		<ol className="ci-sources">
			{sources.map((s) => (
				<li key={s.id} id={sourceAnchor(s.id)} className="ci-source" tabIndex={-1}>
					<p className="ci-source__meta">
						<strong>{s.publisher}</strong>
						{s.country ? ` · ${s.country}` : ""}
						{s.language && s.language !== "English" ? ` · ${s.language}` : ""}
						{s.kind === "news" ? ` · ${formatDate(s.publishedAt)}` : ""}
						{` · ${KIND_LABEL[s.kind]}`}
					</p>
					{s.url ? (
						<a
							href={s.url}
							target="_blank"
							rel="noopener noreferrer"
							className="ci-source__title"
						>
							{s.title}
							<span className="sr-only"> (opens in a new tab)</span>
						</a>
					) : (
						<span className="ci-source__title">{s.title}</span>
					)}
					{s.excerpt ? <p className="ci-source__excerpt">{s.excerpt}</p> : null}
				</li>
			))}
		</ol>
	);
}

/** Which providers answered, in plain words, so missing coverage is visible. */
export function RetrievalSummary({ retrieval }: { retrieval: RetrievalStatus[] }) {
	if (retrieval.length === 0) return null;
	const failed = retrieval.filter((r) => r.status === "failed");
	const used = retrieval.filter((r) => r.count > 0).length;
	return (
		<p className="ci-retrieval">
			Checked {retrieval.length} news feeds and services; {used} had coverage
			used here.
			{failed.length > 0
				? ` Could not reach: ${failed.map((f) => f.provider).join(", ")}.`
				: ""}
		</p>
	);
}
