import { expect, test } from "@playwright/test";
import { BRIEF, SOURCES } from "./fixtures";
import { expectAccessible, expectNoSidewaysScroll, expectReadableText, expectTapTargets, isolate, serveBrief, snapshot } from "./support";

const sse = (events: Array<[string, unknown]>) => events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");

test.describe("waiting screen", () => {
	test("shows where the search is about before the server answers at all", async ({ page }, testInfo) => {
		const net = await isolate(page);
		// The server never answers: the place must come from the search's own words.
		await page.route("**/api/intelligence/stream", () => new Promise(() => {}));
		await page.goto("/analysis?topic=Sudan%20humanitarian%20access");
		await expect(page.getByRole("heading", { level: 1, name: "Sudan humanitarian access" })).toBeVisible();
		await expect(page.locator(".ci-place-map")).toBeVisible({ timeout: 3_000 });
		await expect(page.getByText("Sudan shares land borders with")).toBeVisible();
		await expect(page.locator(".al-steps__step")).toHaveCount(4);
		await expectNoSidewaysScroll(page);
		await expectTapTargets(page);
		await expectReadableText(page);
		await expectAccessible(page, testInfo);
		await snapshot(page, testInfo, "waiting");
		expect(net.errors()).toEqual([]);
	});

	test("places a sea search between the countries on its shores", async ({ page }) => {
		await isolate(page);
		await page.route("**/api/intelligence/stream", () => new Promise(() => {}));
		await page.goto("/analysis?topic=Red%20Sea%20shipping%20tensions");
		await expect(page.getByText("The Red Sea lies between Egypt, Sudan, Eritrea, Djibouti, Yemen and Saudi Arabia.")).toBeVisible();
	});

	test("streams sources and the 30-second version, then opens the finished brief", async ({ page }, testInfo) => {
		const net = await isolate(page);
		await serveBrief(page);
		await page.route("**/api/intelligence/stream", (route) =>
			route.fulfill({
				status: 200,
				headers: { "content-type": "text/event-stream; charset=utf-8" },
				body: sse([
					["stage", { stage: "retrieving" }],
					["sources", { sources: SOURCES, retrieval: BRIEF.retrieval }],
					["orientation", { orientation: BRIEF.orientation }],
					["stage", { stage: "writing" }],
					["brief", BRIEF],
				]),
			}),
		);
		await page.goto("/analysis?topic=Sudan");
		await expect(page).toHaveURL(`/brief/${BRIEF.id}`);
		await expect(page.getByRole("heading", { level: 1 })).toHaveText(BRIEF.headline);
		await snapshot(page, testInfo, "brief-after-stream");
		expect(net.errors()).toEqual([]);
	});

	test("explains a failure in plain words and offers to try again", async ({ page }, testInfo) => {
		await isolate(page);
		await page.route("**/api/intelligence/stream", (route) =>
			route.fulfill({ status: 429, json: { error: "RATE_LIMITED", message: "Too many briefs from this connection. Please wait a minute.", requestId: "r1" } }),
		);
		await page.goto("/analysis?topic=Sudan");
		// The message is also announced in a live region; check the one on screen.
		await expect(page.locator(".ci-notice__text")).toContainText("Too many briefs from this connection.");
		await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
		await expectTapTargets(page);
		await expectAccessible(page, testInfo);
	});
});
