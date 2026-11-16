import { expect, test } from "@playwright/test";
import { BRIEF } from "./fixtures";
import { expectAccessible, expectNoSidewaysScroll, expectReadableText, expectSharedLeftEdge, expectTapTargets, isolate, serveBrief, snapshot } from "./support";

test.describe("brief page", () => {
	test.beforeEach(async ({ page }) => {
		await serveBrief(page);
	});

	test("reads in three layers, aligned, accessible and within the screen", async ({ page }, testInfo) => {
		const net = await isolate(page);
		await page.goto(`/brief/${BRIEF.id}`);
		await expect(page.getByRole("heading", { level: 1 })).toHaveText(BRIEF.headline);
		await expect(page.getByRole("heading", { level: 2 })).toHaveText([/^In 30 seconds/, "The facts", "Who and where", "Go deeper"]);
		// Go deeper starts folded; every old section link still has a target.
		expect(await page.locator("#layer-deeper details[open]").count()).toBe(0);
		for (const id of ["summary", "map", "key-facts", "coverage", "timeline", "perspectives", "population", "context", "sources"]) {
			await expect(page.locator(`#${id}`)).toHaveCount(1);
		}
		await expect(page.locator(".ci-numbers__figure")).toHaveText(["34 million", "47%"]);
		await expectSharedLeftEdge(page, [".site-header__brand", "h1", ".ci-nav__link", ".ci-layer__title"]);
		// The 30-second version starts inside the first screen.
		const top = await page.locator(".ci-thirty").evaluate((e) => e.getBoundingClientRect().top);
		expect(top).toBeLessThan(page.viewportSize()!.height);
		await expectNoSidewaysScroll(page);
		await expectTapTargets(page);
		await expectReadableText(page);
		await expectAccessible(page, testInfo);
		await snapshot(page, testInfo, "brief");
		expect(net.errors()).toEqual([]);
	});

	test("defines an abbreviation when it is tapped, and Escape closes it", async ({ page }) => {
		await isolate(page);
		await page.goto(`/brief/${BRIEF.id}`);
		const term = page.locator(".ci-term", { hasText: "RSF" }).first();
		await term.click();
		await expect(term).toHaveAttribute("aria-expanded", "true");
		await expect(page.getByText("Rapid Support Forces, a paramilitary group fighting the army.").first()).toBeVisible();
		await page.keyboard.press("Escape");
		await expect(term).toHaveAttribute("aria-expanded", "false");
	});

	test("shows a sea event on the map and the timeline can move the map to it", async ({ page }) => {
		await isolate(page);
		await page.goto(`/brief/${BRIEF.id}`);
		await expect(page.locator(".ci-map-water")).toHaveText(["Red Sea"]);
		await expect(page.locator(".ci-map-legend")).toContainText("pinned on the sea or strait");
		await page.locator("#timeline summary").click();
		await page.getByRole("button", { name: /Show on map: Attacks on shipping in the Red Sea/ }).click();
		await expect(page.locator(".leaflet-tooltip")).toContainText("Attacks on shipping in the Red Sea");
	});

	test("with every section open, still accessible and within the screen", async ({ page }, testInfo) => {
		await isolate(page);
		await page.goto(`/brief/${BRIEF.id}`);
		await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
		await expectNoSidewaysScroll(page);
		await expectTapTargets(page);
		await expectReadableText(page);
		await expectAccessible(page, testInfo);
		await snapshot(page, testInfo, "brief-open");
	});

	test("an older brief without the newer fields still reads well", async ({ page }, testInfo) => {
		await isolate(page);
		const old = { ...BRIEF, id: "e2eOldBrief1", orientation: undefined, glossary: undefined };
		await serveBrief(page, old);
		await page.goto(`/brief/${old.id}`);
		await expect(page.locator("#summary")).toBeVisible();
		await expect(page.locator(".ci-thirty")).toHaveCount(0);
		await expectNoSidewaysScroll(page);
		await expectAccessible(page, testInfo);
	});
});

test("a missing brief explains itself and offers a new search", async ({ page }, testInfo) => {
	await isolate(page);
	await page.route("**/api/briefs/goneBrief01", (route) => route.fulfill({ status: 404, json: { error: "NOT_FOUND", message: "This brief is no longer available.", requestId: "r" } }));
	await page.goto("/brief/goneBrief01");
	await expect(page.getByRole("heading", { name: "This brief is no longer available" })).toBeVisible();
	await expectTapTargets(page);
	await expectAccessible(page, testInfo);
});
