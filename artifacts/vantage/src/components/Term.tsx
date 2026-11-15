import { useEffect, useId, useState } from "react";
import { splitTerms, type GlossaryEntry } from "@/lib/terms";

/**
 * A word the brief defines. Tapping it opens the definition inline, right
 * after the word, so it never covers text or runs off a phone screen. Escape
 * closes it. Definitions are written by the model and say so.
 */
function Term({ text, entry }: { text: string; entry: GlossaryEntry }) {
	const [open, setOpen] = useState(false);
	const id = useId();
	useEffect(() => {
		if (!open) return;
		const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
		window.addEventListener("keydown", close);
		return () => window.removeEventListener("keydown", close);
	}, [open]);
	return (
		<>
			<button type="button" className="ci-term" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
				{text}
			</button>
			<span id={id} className="ci-term__def" role="note" hidden={!open}>
				<strong>{entry.term}:</strong> {entry.meaning} <span className="ci-term__src">Model background</span>
			</span>
		</>
	);
}

/** Text with its glossary terms made tappable. Pass one `used` set per page so each term is explained once. */
export function TermText({ text, glossary, used }: { text: string; glossary?: GlossaryEntry[] | null; used?: Set<string> }) {
	return (
		<>
			{splitTerms(text, glossary, used).map((s, i) =>
				"term" in s ? <Term key={i} text={s.text} entry={s.term} /> : <span key={i}>{s.text}</span>,
			)}
		</>
	);
}

/** Every defined term in one place, for readers who want the vocabulary first. */
export function WordsToKnow({ glossary }: { glossary?: GlossaryEntry[] | null }) {
	if (!glossary?.length) return null;
	return (
		<dl className="ci-words">
			{glossary.map((g) => (
				<div key={g.term} className="ci-words__item">
					<dt>{g.term}</dt>
					<dd>{g.meaning}</dd>
				</div>
			))}
		</dl>
	);
}
