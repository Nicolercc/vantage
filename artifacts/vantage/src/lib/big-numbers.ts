import type { Claim } from "@workspace/api-client-react";

export type BigNumber = { figure: string; caption: string; claim: Claim };

/**
 * A money amount, a percentage, a number with a scale word ("34 million"), or
 * a plain number of at least two digits. Commas and decimals are kept as written.
 */
const FIGURE =
	/(?:[$€£]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:million|billion|trillion))?|\d[\d,]*(?:\.\d+)?\s?(?:%|percent|million|billion|trillion)|\b\d{1,3}(?:,\d{3})+\b|\b\d{2,}\b)/i;

const isYear = (s: string) => /^\d{4}$/.test(s) && Number(s) >= 1900 && Number(s) <= 2100;

/**
 * Up to three large figures for the top of a brief, taken only from key facts
 * that passed every check. The figure is shown exactly as the fact writes it,
 * never computed or rounded, and the rest of the fact is its caption.
 */
export function bigNumbers(keyFacts: Claim[], max = 3): BigNumber[] {
	const out: BigNumber[] = [];
	for (const claim of keyFacts) {
		if (claim.support !== "verified") continue;
		const text = claim.text;
		const re = new RegExp(FIGURE.source, "gi");
		let m: RegExpExecArray | null;
		while ((m = re.exec(text))) {
			const figure = m[0].trim();
			if (isYear(figure)) continue;
			out.push({ figure, caption: text, claim });
			break;
		}
		if (out.length === max) break;
	}
	return out;
}
