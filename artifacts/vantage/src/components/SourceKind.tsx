import { useState } from "react";
/** Where a part of the brief comes from. Every part says so next to its title. */
export type Kind = "sourced" | "background" | "retrieved";

const KIND_LABEL: Record<Kind, string> = {
	sourced: "From retrieved reporting",
	background: "Model background",
	retrieved: "Retrieved, not written by the model",
};

const KIND_HELP: Record<Kind, string> = {
	sourced: "Each statement quotes the numbered sources that say it; the quotes are checked against the sources.",
	background: "Written by the model from general knowledge; not individually sourced.",
	retrieved: "Fetched from news feeds, a news search and Wikipedia.",
};

export function KindTag({ kind }: { kind: Kind }) {
	return (
		<span className={`ci-kind ci-kind--${kind}`} title={KIND_HELP[kind]}>
			{KIND_LABEL[kind]}
		</span>
	);
}

const KIND_ICON: Record<Kind, string> = { sourced: "✓", background: "○", retrieved: "↗" };

/**
 * The quiet form of the same label: a small mark beside a title. The words
 * are in the tooltip and read out by screen readers, and the page's
 * "How to read this brief" key explains the marks once.
 */
export function KindMark({ kind }: { kind: Kind }) {
	return (
		<span className={`ci-mark ci-mark--${kind}`} title={`${KIND_LABEL[kind]}: ${KIND_HELP[kind]}`}>
			<span aria-hidden>{KIND_ICON[kind]}</span>
			<span className="sr-only">{KIND_LABEL[kind]}. {KIND_HELP[kind]}</span>
		</span>
	);
}

const KEY_STORE = "vantage:reading-key-dismissed";

/** The key in a few words; the full wording is on each mark. */
const KEY_SHORT: Record<Kind, string> = {
	sourced: "From news reports, each quote checked against its source",
	background: "Background written by AI, not tied to a source",
	retrieved: "The original reporting, as found",
};

function readDismissed() {
	try {
		return localStorage.getItem(KEY_STORE) === "1";
	} catch {
		return false;
	}
}

/** One explanation of the marks, at the top of the brief. Dismissing it is remembered in this browser only. */
export function ReadingKey() {
	const [hidden, setHidden] = useState(readDismissed);
	if (hidden) return null;
	return (
		<aside className="ci-key" aria-label="How to read this brief">
			<p className="ci-key__title">How to read this brief</p>
			<ul className="ci-key__list">
				{(["sourced", "background", "retrieved"] as Kind[]).map((k) => (
					<li key={k}>
						<span className={`ci-mark ci-mark--${k}`} aria-hidden>
							{KIND_ICON[k]}
						</span>{" "}
						{KEY_SHORT[k]}
					</li>
				))}
			</ul>
			<button
				type="button"
				className="ci-key__close"
				onClick={() => {
					setHidden(true);
					try {
						localStorage.setItem(KEY_STORE, "1");
					} catch {
						/* storage blocked: hidden for this visit only */
					}
				}}
			>
				Got it
			</button>
		</aside>
	);
}
