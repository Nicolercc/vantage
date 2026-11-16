import { expect, test } from "@playwright/test";
import { expectAccessible, expectNoSidewaysScroll, expectReadableText, expectSharedLeftEdge, expectTapTargets, isolate, snapshot } from "./support";

const SAMPLE = "/sample/sudan-2026-11-16";
const AFRICANEWS = "http://africanews.com/2026/11/13/un-food-agency-chief-calls-for-end-to-sudan-war-as-famine-crisis-deepens";

test.describe("sample brief", () => {
	test("opens with every API request failing, as during an API restart", async ({ page }, testInfo) => {
		const net = await isolate(page);
		let apiCalls = 0;
		await page.route("**/api/**", (route) => {
			apiCalls += 1;
			return route.abort();
		});
		await page.goto(SAMPLE);
		await expect(page.getByRole("note").filter({ hasText: "Reviewed sample from Nov 16, 2026" })).toBeVisible();
		await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sudan's humanitarian crisis deepens as funding and access collapse");
		await expect(page.locator(".ci-hero__meta")).toContainText("Nov 16, 2026 · 10 news reports from 8 outlets");
		await expect(page.locator(".ci-thirty__row")).toHaveCount(4);
		// The 30-second answer starts on the first screen.
		const top = await page.locator(".ci-thirty").evaluate((e) => e.getBoundingClientRect().top);
		expect(top).toBeLessThan(page.viewportSize()!.height);
		await expectSharedLeftEdge(page, [".site-header__brand", "h1", ".ci-layer__title"]);
		await expectNoSidewaysScroll(page);
		await expectTapTargets(page);
		await expectReadableText(page);
		await expectAccessible(page, testInfo);
		await snapshot(page, testInfo, "sample");
		expect(net.errors()).toEqual([]);
		// The healthz wake-up ping is the only API request the sample page may make.
		expect(apiCalls).toBeLessThanOrEqual(1);
	});

	test("goes from the first checked fact to its exact quote and the original article", async ({ page }) => {
		await isolate(page);
		await page.goto(SAMPLE);
		const toggle = page.getByRole("button", { name: "See source quote" });
		await expect(toggle).toHaveCount(1);
		await expect(toggle).toHaveAttribute("aria-expanded", "false");
		await toggle.click();
		await expect(toggle).toHaveAttribute("aria-expanded", "true");
		await expect(toggle).toBeFocused();
		const panel = page.getByRole("region", { name: "Source quote for this fact" });
		await expect(panel).toContainText("The UN says around 34 million people — nearly two-thirds of Sudan's population — need humanitarian assistance.");
		await expect(panel).toContainText("Africanews");
		const original = panel.getByRole("link", { name: /Read the original on Africanews/ });
		await expect(original).toHaveAttribute("href", AFRICANEWS);
		await expect(original).toHaveAttribute("target", "_blank");
		await expect(original).toHaveAttribute("rel", /noopener/);
		await page.keyboard.press("Escape");
		await expect(panel).toBeHidden();
		await toggle.click();
		await panel.getByRole("button", { name: "Hide quote" }).click();
		await expect(panel).toBeHidden();
		await expect(toggle).toBeFocused();
	});

	test("an unknown sample points to the newest one", async ({ page }, testInfo) => {
		await isolate(page);
		await page.goto("/sample/retired-2026-01-01");
		await expect(page.getByRole("heading", { name: "This sample isn't available" })).toBeVisible();
		await expect(page.getByRole("link", { name: "Read the newest sample" })).toHaveAttribute("href", SAMPLE);
		await expectTapTargets(page);
		await expectAccessible(page, testInfo);
	});

	test("Report a problem names the sample page, not a dead /brief/ link", async ({ page }) => {
		await isolate(page);
		await page.goto(SAMPLE);
		const href = await page.getByRole("link", { name: /Report a problem with this brief/ }).getAttribute("href");
		expect(decodeURIComponent(href!)).toContain(`${SAMPLE}`);
		expect(decodeURIComponent(href!)).not.toContain("/brief/");
	});
});

test.describe("numbered citations (regression)", () => {
	test("still open in place, show the source, and close on Escape and an outside tap", async ({ page }) => {
		await isolate(page);
		await page.goto(SAMPLE);
		const cite = page.locator("#key-facts .ci-cite").first();
		await cite.click();
		await expect(cite).toHaveAttribute("aria-expanded", "true");
		const pop = page.locator(".ci-cite-pop");
		await expect(pop).toContainText("Africanews");
		await expect(pop.getByRole("link", { name: /Read the original on Africanews/ })).toHaveAttribute("href", AFRICANEWS);
		await page.keyboard.press("Escape");
		await expect(pop).toHaveCount(0);
		await cite.click();
		await page.locator("h1").click();
		await expect(pop).toHaveCount(0);
	});

	test("'Show in source list' opens the folded Sources section and lands on the source", async ({ page }) => {
		await isolate(page);
		await page.goto(SAMPLE);
		await expect(page.locator("#sources details")).not.toHaveAttribute("open", "");
		await page.locator("#key-facts .ci-cite").first().click();
		await page.locator(".ci-cite-pop").getByRole("link", { name: "Show in source list" }).click();
		await expect(page.locator("#sources details")).toHaveAttribute("open", "");
		await expect(page.locator("#source-S5")).toBeFocused();
	});
});
