import { describe, expect, it } from "vitest";
import type { Claim } from "@workspace/api-client-react";
import { bigNumbers } from "./big-numbers";

const fact = (text: string, support: Claim["support"] = "verified") => ({ text, sourceIds: ["S1"], evidence: [], support }) as unknown as Claim;
const figures = (claims: Claim[]) => bigNumbers(claims).map((b) => b.figure);

describe("bigNumbers", () => {
	it("takes the figure each verified fact states, exactly as written", () => {
		expect(
			figures([
				fact("Around 34 million people need humanitarian assistance."),
				fact("Sudan's $2.9 billion aid plan is funded at 47%."),
				fact("Suez traffic reached 1,338 transits in October."),
			]),
		).toEqual(["34 million", "$2.9 billion", "1,338"]);
	});

	it("skips years, single digits, unverified facts and facts without a figure", () => {
		expect(
			figures([
				fact("The war began in April 2023."),
				fact("Fighting resumed after 3 days."),
				fact("At least 71 aid workers were killed.", "unverified"),
				fact("Drones now travel farther than before."),
				fact("At least 71 aid workers were killed in 2025."),
			]),
		).toEqual(["71"]);
	});

	it("shows at most three", () => {
		expect(bigNumbers([fact("10 a"), fact("20 b"), fact("30 c"), fact("40 d")])).toHaveLength(3);
	});
});
