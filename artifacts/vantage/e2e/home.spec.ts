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
		await expect(page.getByRole("button", { name: "Explain this" })).toBeVisible();
		// Without Today topics, the example chips stand in.
		await expect(page.getByRole("button", { name: "Sudan aid access" })).toBeVisible();
		await expectSharedLeftEdge(page, [".site-header__brand", "h1", ".home-search__row", ".home-search__hint", ".home-chip"]);
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
		await expect(today).toContainText("Sudan");
		await expect(today).toContainText("Red Sea");
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
		await page.getByRole("button", { name: "Explain this" }).click();
		await expect(page).toHaveURL(/\/analysis\?topic=Sudan(\+|%20)humanitarian(\+|%20)access/);
	});
});
