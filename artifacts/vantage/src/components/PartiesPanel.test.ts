import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PartiesPanel } from "./PartiesPanel";

describe("PartiesPanel", () => {
	// The parties are written by the model from general knowledge, not quoted
	// from a source, so the panel must say so like every other background section.
	it("labels the parties as model background", () => {
		const html = renderToStaticMarkup(
			createElement(PartiesPanel, { parties: [{ name: "Sudanese Armed Forces", color: "#123456" }], active: true }),
		);
		expect(html).toContain("Sudanese Armed Forces");
		expect(html).toContain("Model background");
		expect(html).toContain("not individually sourced");
	});
});
