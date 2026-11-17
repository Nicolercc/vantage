/** Which sides of a sideways-scrolling row still hide items: "right" at the start, "left" at the end, "both" in between. */
export type HiddenSides = "none" | "left" | "right" | "both";

export function hiddenSides(scrollLeft: number, clientWidth: number, scrollWidth: number): HiddenSides {
	const left = scrollLeft > 1;
	const right = scrollLeft + clientWidth < scrollWidth - 1;
	return left && right ? "both" : left ? "left" : right ? "right" : "none";
}
