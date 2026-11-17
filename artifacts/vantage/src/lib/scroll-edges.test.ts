import { describe, expect, it } from "vitest";
import { hiddenSides } from "./scroll-edges";

describe("hiddenSides", () => {
	it("says which side still has items to scroll to", () => {
		expect(hiddenSides(0, 335, 573)).toBe("right");
		expect(hiddenSides(100, 335, 573)).toBe("both");
		expect(hiddenSides(238, 335, 573)).toBe("left");
		expect(hiddenSides(0, 760, 573)).toBe("none");
	});

	it("ignores sub-pixel rounding at either end", () => {
		expect(hiddenSides(0.5, 335, 573)).toBe("right");
		expect(hiddenSides(237.5, 335, 573)).toBe("left");
	});
});
