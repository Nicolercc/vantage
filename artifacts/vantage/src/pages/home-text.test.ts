import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The README promises text of at least 11px with 4.5:1 contrast. These read
 * the homepage stylesheet itself, so a regression fails here rather than in
 * a later browser audit.
 */
const css = readFileSync(new URL("./HomePage.css", import.meta.url), "utf8");

const rule = (selector: string) => {
	const m = new RegExp(`(?:^|\\n)${selector.replace(/[.]/g, "\\.")}\\s*\\{([^}]*)\\}`).exec(css);
	if (!m) throw new Error(`no rule for ${selector}`);
	return m[1]!;
};
const prop = (block: string, name: string) => new RegExp(`(?:^|[;\\s])${name}:\\s*([^;]+);`).exec(block)?.[1]?.trim();
const token = (name: string) => prop(rule(".home"), name)!;

function luminance(hex: string) {
	const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
	const [r, g, b] = c.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
	return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string) => {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi! + 0.05) / (lo! + 0.05);
};

describe("homepage text", () => {
	it("is never set below 11px", () => {
		const sizes = [...css.matchAll(/font-size:\s*([\d.]+)(rem|px)\s*;/g)].map(([, n, unit]) => Number(n) * (unit === "rem" ? 16 : 1));
		expect(sizes.length).toBeGreaterThan(0);
		expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);
	});

	it.each([
		[".home-strip__meta", "--home-sand-deep"],
		[".home-footer", "--home-sand"],
	])("%s meets 4.5:1 against its background", (selector, background) => {
		const color = prop(rule(selector), "color")!;
		expect(contrast(color, token(background))).toBeGreaterThanOrEqual(4.5);
	});

	// The Start here card is white; its pill carries its own background.
	// Today rows and labels sit on the hero's sand.
	it.each([
		[".home-start__meta", "#ffffff"],
		[".home-start__headline", "#ffffff"],
		[".home-start__why", "#ffffff"],
		[".home-start__go", "#ffffff"],
		[".home-start__pill", prop(rule(".home-start__pill"), "background")!],
		[".home-start__pill--old", prop(rule(".home-start__pill--old"), "background")!],
		[".home-today__row", "--home-sand-deep"],
		[".home-today__when", "--home-sand-deep"],
		[".home-paste", "--home-sand-deep"],
	])("%s meets 4.5:1 against %s", (selector, background) => {
		const color = prop(rule(selector), "color")!;
		const bg = background.startsWith("--") ? token(background) : background;
		expect(contrast(color, bg)).toBeGreaterThanOrEqual(4.5);
	});
});
