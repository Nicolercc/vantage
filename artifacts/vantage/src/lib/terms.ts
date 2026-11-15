export type GlossaryEntry = { term: string; meaning: string };
export type Segment = { text: string } | { text: string; term: GlossaryEntry };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** An all-capitals term (RSF, UNHCR) must match exactly; a word may differ in case. */
const flags = (term: string) => (term === term.toUpperCase() ? "u" : "iu");

/**
 * Split text so each glossary term's first appearance can become a tappable
 * definition. `used` carries across calls, so a term is explained once per
 * section, not every time it appears. Longer terms win where two overlap
 * ("Rapid Support Forces" before "Forces").
 */
export function splitTerms(text: string, glossary: GlossaryEntry[] | null | undefined, used = new Set<string>()): Segment[] {
	const entries = [...(glossary ?? [])].sort((a, b) => b.term.length - a.term.length);
	const found: { start: number; end: number; entry: GlossaryEntry }[] = [];
	for (const entry of entries) {
		const key = entry.term.toLowerCase();
		if (used.has(key)) continue;
		const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escape(entry.term)}(?![\\p{L}\\p{N}_])`, flags(entry.term));
		const m = re.exec(text);
		if (!m) continue;
		const start = m.index;
		const end = start + m[0].length;
		if (found.some((f) => start < f.end && end > f.start)) continue;
		found.push({ start, end, entry });
		used.add(key);
	}
	found.sort((a, b) => a.start - b.start);
	const out: Segment[] = [];
	let at = 0;
	for (const f of found) {
		if (f.start > at) out.push({ text: text.slice(at, f.start) });
		out.push({ text: text.slice(f.start, f.end), term: f.entry });
		at = f.end;
	}
	if (at < text.length) out.push({ text: text.slice(at) });
	return out;
}
