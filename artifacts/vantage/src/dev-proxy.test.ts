import { afterEach, describe, expect, it, vi } from "vitest";

/** `pnpm dev` must exercise the API running on this machine unless told otherwise. */
async function proxyTarget(env: Record<string, string>) {
	vi.resetModules();
	for (const [k, v] of Object.entries({ PORT: "5173", BASE_PATH: "/", ...env })) vi.stubEnv(k, v);
	const { default: config } = await import("../vite.config");
	const proxy = (config as { server?: { proxy?: Record<string, { target?: string }> } }).server?.proxy;
	return proxy?.["/api"]?.target;
}

afterEach(() => vi.unstubAllEnvs());

describe("development proxy", () => {
	it("sends /api to the local API server by default", async () => {
		vi.stubEnv("VITE_API_PROXY_TARGET", "");
		expect(await proxyTarget({})).toBe("http://localhost:3001");
	});

	it("can be pointed at another API explicitly", async () => {
		expect(await proxyTarget({ VITE_API_PROXY_TARGET: "https://api.example.org" })).toBe("https://api.example.org");
	});
});
