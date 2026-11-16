import { expect, test } from "@playwright/test";
import type { TrendingResponse } from "@workspace/api-client-react";
import { expectAccessible, expectNoSidewaysScroll, expectReadableText, expectSharedLeftEdge, expectTapTargets, isolate, snapshot } from "./support";

const TODAY: TrendingResponse = {
	updatedAt: "2026-11-15T09:00:00Z",
	windowHours: 24,
	outletCount: 9,
	topics: [
		{ label: "Sudan", country: "Sudan", outletCount: 7, newestAt: "2026-11-15T08:00:00Z", headline: { title: "Aid convoys stall", publisher: "Example World", url: "https://example.org/1" }, briefId: "e2eBrief0001" },
		{ label: "Red Sea", country: "Yemen", outletCount: 5, newestAt: "2026-11-15T07:00:00Z", headline: { title: "Shipping slows", publisher: "Example Gulf", url: "https://example.org/2" }, briefId: null },
	],
};

test.describe("home page", () => {
	test("is readable at once, aligned, accessible and fits the screen", async ({ page }, testInfo) => {
		const net = await isolate(page);
		await page.route("**/api/trending", (route) => route.fulfill({ status: 503, json: { error: "OVERLOADED", message: "Busy", requestId: "t" } }));
		await page.goto("/");
		// The headline is visible from the first frame, not faded in late.
		const opacity = await page.locator("h1").evaluate((h) => Number(getComputedStyle(h).opacity));
		expect(opacity).toBeGreaterThan(0.9);
		await expect(page.getByRole("button", { name: "Explain", exact: true })).toBeVisible();
		// The search box and the whole ready story fit on the first screen.
		const fold = page.viewportSize()!.height;
		for (const sel of [".home-search__input", ".home-start__card"]) {
			const bottom = await page.locator(sel).evaluate((e) => e.getBoundingClientRect().bottom);
			expect(bottom, `${sel} ends above the fold`).toBeLessThanOrEqual(fold);
		}
		await expect(page.locator(".home-start__card")).toHaveAttribute("href", "/sample/sudan-2026-11-16");
		await expect(page.locator(".home-start__card")).toContainText("Read in about a minute");
		// Without Today topics, the example chips stand in.
		await expect(page.getByRole("button", { name: "Gaza ceasefire" })).toBeVisible();
		await expectSharedLeftEdge(page, [".site-header__brand", "h1", ".home-search__row", ".home-start__card", ".home-chip"]);
		await expectNoSidewaysScroll(page);
		await expectTapTargets(page);
		await expectReadableText(page);
		await expectAccessible(page, testInfo);
		await snapshot(page, testInfo, "home");
		expect(net.errors()).toEqual([]);
	});

	test("shows today's most covered topics when they are available", async ({ page }, testInfo) => {
		const net = await isolate(page);
		await page.route("**/api/trending", (route) => route.fulfill({ status: 200, json: TODAY }));
		await page.goto("/");
		const today = page.locator(".home-today");
		// Rows say what they open: a ready brief, or a fresh look at the coverage.
		await expect(today.getByRole("link", { name: /Explore coverage of Sudan/ })).toContainText("Ready");
		await expect(today.getByRole("link", { name: /Explore coverage of Red Sea/ })).toContainText("about a minute");
		await expectNoSidewaysScroll(page);
		await expectTapTargets(page);
		await expectAccessible(page, testInfo);
		await snapshot(page, testInfo, "home-today");
		expect(net.errors()).toEqual([]);
	});

	test("a typed topic opens the brief page for it", async ({ page }) => {
		await isolate(page);
		await page.route("**/api/trending", (route) => route.fulfill({ status: 503, json: {} }));
		// Hold the brief request open: this test is about navigation, not the brief.
		await page.route("**/api/intelligence/stream", () => new Promise(() => {}));
		await page.goto("/");
		await page.getByRole("searchbox").fill("Sudan humanitarian access");
		await page.getByRole("button", { name: "Explain", exact: true }).click();
		await expect(page).toHaveURL(/\/analysis\?topic=Sudan(\+|%20)humanitarian(\+|%20)access/);
	});

	test("Start here opens the sample brief", async ({ page }) => {
		await isolate(page);
		await page.route("**/api/trending", (route) => route.fulfill({ status: 503, json: {} }));
		await page.goto("/");
		await page.locator(".home-start__card").click();
		await expect(page).toHaveURL(/\/sample\/sudan-2026-11-16$/);
		await expect(page.getByRole("note").filter({ hasText: "Reviewed sample" })).toBeVisible();
	});

	test("Paste it switches to the article box and back", async ({ page }) => {
		await isolate(page);
		await page.route("**/api/trending", (route) => route.fulfill({ status: 503, json: {} }));
		await page.goto("/");
		await page.getByRole("button", { name: "Have an article? Paste it" }).click();
		await expect(page.locator(".home-search__textarea")).toBeFocused();
		await page.getByRole("button", { name: "Ask about a story instead" }).click();
		await expect(page.getByRole("searchbox")).toBeFocused();
	});
});
