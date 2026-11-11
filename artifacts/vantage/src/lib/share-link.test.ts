import { describe, expect, it } from "vitest";
import { temporaryLinkNotice } from "./share-link";

describe("share link notice", () => {
	it("warns when the server keeps briefs only until it restarts", () => {
		expect(temporaryLinkNotice({ link: { durable: false } })).toMatch(/stop working when .* restarts/);
	});

	it("says nothing when the link is durable or the server did not say", () => {
		expect(temporaryLinkNotice({ link: { durable: true } })).toBeNull();
		expect(temporaryLinkNotice({})).toBeNull();
	});
});
