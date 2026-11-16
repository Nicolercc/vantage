import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/brief-preview.js";
import { SAMPLE_PREVIEWS, loadSample } from "../../api/_samples.js";
import { SAMPLES } from "../samples";
import { clip, coverageLine, escapeHtml, isBriefId, previewHtml, previewMeta } from "../../api/_preview.js";

type PreviewBrief = Parameters<typeof coverageLine>[0];

const ORIGIN = "https://vantage.example";
const brief = (over: Partial<PreviewBrief> = {}): PreviewBrief => ({
	id: "abcDEF123_-x",
	headline: "Aid access to El Fasher remains blocked amid fighting",
	summary: "Fighting continues around El Fasher. Aid agencies report deliveries turned back.",
	generatedAt: "2026-10-08T10:00:00.000Z",
	inScope: true,
	sources: [
		{ kind: "news", publisher: "UN News" },
		{ kind: "news", publisher: "UN News" },
		{ kind: "news", publisher: "Al Jazeera" },
		{ kind: "reference", publisher: "Wikipedia" },
	],
	...over,
});

describe("preview for a shared brief", () => {
	it("uses the brief's headline, a labelled description and its own image", () => {
		const m = previewMeta(brief(), ORIGIN, "/brief/abcDEF123_-x");
		expect(m.title).toBe("Aid access to El Fasher remains blocked amid fighting · Vantage");
		expect(m.description).toMatch(/^AI-generated brief · 3 articles from 2 outlets\. Fighting continues/);
		expect(m.image).toBe("https://vantage.example/api/og?id=abcDEF123_-x");
		expect(m.url).toBe("https://vantage.example/brief/abcDEF123_-x");
	});

	it("says so when nothing was retrieved", () => {
		expect(coverageLine(brief({ sources: [{ kind: "reference", publisher: "Wikipedia" }] }))).toBe("No recent coverage retrieved");
		expect(coverageLine(brief({ sources: [{ kind: "news", publisher: "BBC News" }] }))).toBe("1 article from 1 outlet");
	});

	it("falls back to the site's own preview when the brief is missing or out of scope", () => {
		for (const b of [null, brief({ inScope: false }), brief({ headline: "  " })]) {
			const m = previewMeta(b, ORIGIN, "/brief/x");
			expect(m.title).toBe("Vantage — conflict, in context");
			expect(m.image).toBe("https://vantage.example/og-default.png");
		}
	});

	it("keeps long text within what preview cards show", () => {
		const long = brief({ headline: "Word ".repeat(60), summary: "Sentence here. ".repeat(60) });
		const m = previewMeta(long, ORIGIN, "/brief/x");
		expect(m.title.length).toBeLessThanOrEqual(100);
		expect(m.description.length).toBeLessThanOrEqual(200);
		expect(clip("short", 20)).toBe("short");
		expect(clip("one two three four five", 12)).toMatch(/…$/);
	});

	it("escapes model-written text so it cannot inject markup", () => {
		const html = previewHtml(
			brief({ headline: `"><script>alert(1)</script>`, summary: `</title><img src=x onerror=alert(1)> & 'quotes'` }),
			ORIGIN,
			"/brief/abcDEF123_-x",
		);
		expect(html).not.toMatch(/<script|<img|onerror=alert\(1\)>/);
		expect(html).toContain("&lt;script&gt;");
		expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
	});

	it("produces a page with the tags crawlers read and no script", () => {
		const html = previewHtml(brief(), ORIGIN, "/brief/abcDEF123_-x");
		for (const tag of ['property="og:title"', 'property="og:description"', 'property="og:image"', 'property="og:url"', 'name="twitter:card" content="summary_large_image"', 'rel="canonical"', 'property="article:published_time"']) {
			expect(html).toContain(tag);
		}
		expect(html).not.toContain("<script");
	});

	it("accepts only well-formed brief ids", () => {
		expect(isBriefId("abcDEF123_-x")).toBe(true);
		for (const bad of ["short", "../../etc/passwd", "a".repeat(40), "has space 12", ""]) expect(isBriefId(bad)).toBe(false);
	});
});

describe("preview for a shared sample", () => {
	afterEach(() => vi.unstubAllGlobals());

	it.each(SAMPLES.map((s) => [s.slug, s] as const))("%s preview fields equal the sample file", async (slug, sample) => {
		const brief = await sample.load();
		expect(loadSample(slug)).toEqual({
			id: brief.id,
			sample: slug,
			headline: brief.headline,
			summary: brief.summary,
			generatedAt: brief.generatedAt,
			inScope: brief.inScope,
			location: { city: brief.location.city, country: brief.location.country },
			sources: brief.sources.map((s) => ({ kind: s.kind, publisher: s.publisher })),
		});
	});

	it("has a preview for every sample and no others", () => {
		expect(Object.keys(SAMPLE_PREVIEWS).sort()).toEqual(SAMPLES.map((s) => s.slug).sort());
	});

	it("serves the sample's own preview without calling the API", async () => {
		const fetch = vi.fn();
		vi.stubGlobal("fetch", fetch);
		const res = await handler(new Request(`${ORIGIN}/api/brief-preview?sample=sudan-2026-11-16`));
		const html = await res.text();
		expect(fetch).not.toHaveBeenCalled();
		expect(html).toContain(`<meta property="og:url" content="${ORIGIN}/sample/sudan-2026-11-16">`);
		expect(html).toContain(`${ORIGIN}/api/og?sample=sudan-2026-11-16`);
		expect(html).toContain("Reviewed sample brief · 10 articles from 8 outlets.");
		expect(html).toContain("Sudan&#39;s humanitarian crisis deepens");
	});

	it("falls back to the site's preview for an unknown or odd slug", async () => {
		vi.stubGlobal("fetch", vi.fn());
		for (const slug of ["retired-2026-01-01", "__proto__", "constructor", ""]) {
			const html = await (await handler(new Request(`${ORIGIN}/api/brief-preview?sample=${slug}`))).text();
			expect(html).toContain("<title>Vantage — conflict, in context</title>");
		}
	});
});

describe("vercel.json sends only link-preview bots to the preview page", () => {
	const config = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as {
		rewrites: { source: string; destination: string; has?: { key: string; value: string }[] }[];
	};
	const rule = config.rewrites.find((r) => r.source === "/sample/:slug")!;
	const isBot = (ua: string) => new RegExp(`^${rule.has![0]!.value}$`).test(ua);

	it("rewrites /sample/:slug for bots, before the app's catch-all", () => {
		expect(rule.destination).toBe("/api/brief-preview?sample=:slug");
		expect(rule.has![0]!.key).toBe("user-agent");
		expect(config.rewrites.indexOf(rule)).toBeLessThan(config.rewrites.findIndex((r) => r.destination === "/index.html"));
	});

	it.each([
		"Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
		"facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
		"WhatsApp/2.23.20.0",
		"Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
		"LinkedInBot/1.0 (compatible; Mozilla/5.0)",
		"TelegramBot (like TwitterBot)",
	])("treats %s as a bot", (ua) => expect(isBot(ua)).toBe(true));

	it.each([
		"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
	])("gives people the app: %s", (ua) => expect(isBot(ua)).toBe(false));
});
