import { defineConfig } from "@playwright/test";

const PORT = 4317;

/**
 * Browser tests against the built site, with the API mocked in each test, so
 * CI needs no API key and spends nothing. Every page is checked at a phone
 * and a desktop size.
 */
export default defineConfig({
	testDir: "e2e",
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
	use: {
		baseURL: `http://127.0.0.1:${PORT}`,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [
		{ name: "phone", use: { browserName: "chromium", viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
		{ name: "desktop", use: { browserName: "chromium", viewport: { width: 1280, height: 800 } } },
	],
	webServer: {
		// Serve the production build, the same files Vercel serves.
		command: `pnpm run build && BASE_PATH=/ PORT=${PORT} pnpm exec vite preview --config vite.config.ts --host 127.0.0.1 --port ${PORT} --strictPort`,
		url: `http://127.0.0.1:${PORT}`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
