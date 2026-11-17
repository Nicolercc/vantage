import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { BRIEF } from "./fixtures";

/** A transparent 1×1 PNG, served for every map tile so tests never touch the network. */
const TILE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

/**
 * Keep every test offline and deterministic: the app's own server answers,
 * map tiles are blank, web fonts fall back, and the API is mocked per test.
 */
export async function isolate(page: Page) {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});
	page.on("pageerror", (err) => errors.push(err.message));
	await page.route(/tile\.openstreetmap\.org/, (route) => route.fulfill({ status: 200, contentType: "image/png", body: TILE }));
	await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
	await page.route("**/api/healthz", (route) => route.fulfill({ status: 200, json: { status: "ok" } }));
	return {
		/** Console errors, ignoring failed requests to services the tests deliberately do not serve. */
		errors: () => errors.filter((e) => !/Failed to load resource/.test(e)),
	};
}

/** Serve the fixture brief (or another) at /api/briefs/:id. */
export async function serveBrief(page: Page, brief = BRIEF) {
	await page.route(`**/api/briefs/${brief.id}`, (route) => route.fulfill({ status: 200, json: brief }));
}

/** No sideways scrolling: the page is never wider than the screen. */
export async function expectNoSidewaysScroll(page: Page) {
	const { scroll, client } = await page.evaluate(() => ({
		scroll: document.documentElement.scrollWidth,
		client: document.documentElement.clientWidth,
	}));
	expect(scroll, "page is wider than the screen").toBeLessThanOrEqual(client);
}

/**
 * Every control a finger uses is at least 44px tall and wide. Exempt, as WCAG
 * 2.5.8 allows: map credits, and controls inside a sentence (citations and
 * defined words), which still answer taps over a 44px area through padding
 * or a pseudo-element and are checked at 24px here.
 */
export async function expectTapTargets(page: Page) {
	const small = await page.evaluate(() => {
		const visible = (e: Element) => {
			const r = e.getBoundingClientRect();
			const cs = getComputedStyle(e);
			return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !e.closest(".sr-only, [hidden], details:not([open]) > :not(summary)");
		};
		const inline = (e: Element) => e.matches(".ci-cite, .ci-term");
		return [...document.querySelectorAll("a[href], button, summary, input:not([type=radio]), label.home-mode, textarea")]
			.filter(visible)
			.filter((e) => !e.closest(".leaflet-control-attribution"))
			.map((e) => {
				const r = e.getBoundingClientRect();
				const min = inline(e) ? 24 : 44;
				return { what: `${e.tagName.toLowerCase()} "${(e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 30)}"`, w: Math.round(r.width), h: Math.round(r.height), min };
			})
			.filter((t) => t.h < t.min || t.w < t.min);
	});
	expect(small, "controls smaller than a comfortable tap").toEqual([]);
}

/** No text a reader has to squint at: nothing visible under 13px. */
export async function expectReadableText(page: Page) {
	const tiny = await page.evaluate(() =>
		[...document.querySelectorAll("body *")]
			.filter((e) => {
				const r = e.getBoundingClientRect();
				return r.width > 0 && r.height > 0 && !e.closest(".sr-only, .leaflet-control-attribution, [aria-hidden=true]") && [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 1);
			})
			.map((e) => ({ text: (e.textContent ?? "").trim().slice(0, 30), size: parseFloat(getComputedStyle(e).fontSize) }))
			.filter((t) => t.size < 13),
	);
	expect(tiny, "text under 13px").toEqual([]);
}

/** These elements all start at the same x position, within a pixel. */
export async function expectSharedLeftEdge(page: Page, selectors: string[]) {
	const lefts = await page.evaluate(
		(sels) => sels.map((s) => {
			const e = document.querySelector(s);
			return e ? { s, left: Math.round(e.getBoundingClientRect().left) } : { s, left: null };
		}),
		selectors,
	);
	for (const l of lefts) expect(l.left, `${l.s} is on the page`).not.toBeNull();
	const first = lefts[0]!.left!;
	for (const l of lefts) expect(Math.abs(l.left! - first), `${l.s} starts at ${l.left}, not ${first}`).toBeLessThanOrEqual(1);
}

/** WCAG 2.1 AA, as axe-core checks it. Serious and critical problems fail the test; every finding is attached. */
export async function expectAccessible(page: Page, testInfo: TestInfo) {
	const results = await new AxeBuilder({ page })
		.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
		// Leaflet's own credit control is third-party markup.
		.exclude(".leaflet-control-attribution")
		.analyze();
	await testInfo.attach("axe-results.json", { body: JSON.stringify(results.violations, null, 2), contentType: "application/json" });
	const blocking = results.violations
		.filter((v) => v.impact === "serious" || v.impact === "critical")
		.map((v) => ({ rule: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) }));
	expect(blocking, "serious accessibility problems").toEqual([]);
}

/** A full-page screenshot kept with the test report, for a person to look at. */
export async function snapshot(page: Page, testInfo: TestInfo, name: string) {
	await testInfo.attach(`${name}.png`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}
