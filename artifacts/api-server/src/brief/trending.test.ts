import { describe, expect, it } from "vitest";
import { placesInHeadline, rankTrending, recencyWeight, type Headline } from "./trending";

const NOW = Date.parse("2026-11-14T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const headline = (title: string, publisher: string, ageHours = 1, extra: Partial<Headline> = {}): Headline => ({
  title,
  publisher,
  url: `https://${publisher.replace(/\s+/g, "").toLowerCase()}.example/${encodeURIComponent(title)}`,
  publishedAt: hoursAgo(ageHours),
  ...extra,
});
const rank = (headlines: Headline[], options = {}) => rankTrending(headlines, { now: NOW, ...options });
const labels = (headlines: Headline[], options = {}) => rank(headlines, options).clusters.map((c) => c.label);

describe("which place a headline is about", () => {
  it.each([
    ["Sudan: aid convoys blocked as fighting continues in El Fasher", ["Sudan"]],
    ["South Sudan ceasefire talks resume in Juba", ["South Sudan"]],
    ["South Sudanese refugees cross border", ["South Sudan"]],
    ["Ukrainian drones strike Russian refinery", ["Ukraine", "Russia"]],
    ["Guinea-Bissau holds vote", []],
    ["Israeli strikes kill dozens in Gaza", ["Gaza", "Israel"]],
    ["Georgia election results delayed", []],
    ["Nigerian army frees hostages", ["Nigeria"]],
    ["Niger junta expels envoy", ["Niger"]],
  ])("%s", (title, expected) => {
    expect(placesInHeadline(title).map((p) => p.label).sort()).toEqual([...expected].sort());
  });
});

describe("ranking what is most covered", () => {
  it("ranks a place covered by more outlets above one covered more often by fewer", () => {
    const result = labels([
      headline("Sudan: fighting near El Fasher", "Outlet A"),
      headline("Sudan aid trucks attacked", "Outlet B"),
      headline("Sudan army retakes town", "Outlet C"),
      headline("Haiti gangs attack police station", "Outlet A"),
      headline("Haiti gang violence spreads", "Outlet A", 2),
      headline("Haiti police killed in attack", "Outlet A", 3),
      headline("Haiti crisis deepens, UN warns", "Outlet B"),
    ]);
    expect(result).toEqual(["Sudan", "Haiti"]);
  });

  it("counts one outlet once per place, however many headlines it ran", () => {
    const [haiti] = rank([
      headline("Haiti gangs attack police station", "Outlet A"),
      headline("Haiti gang violence spreads", "Outlet A", 2),
      headline("Haiti crisis deepens", "Outlet B"),
    ]).clusters;
    expect(haiti).toMatchObject({ label: "Haiti", country: "Haiti", outletCount: 2, headlineCount: 3 });
  });

  it("prefers recent coverage: the same outlets a day ago rank below them an hour ago", () => {
    const result = labels([
      headline("Sudan fighting continues", "Outlet A", 22),
      headline("Sudan aid blocked", "Outlet B", 23),
      headline("Yemen Houthi missile strikes ship", "Outlet A", 1),
      headline("Yemen strikes reported", "Outlet B", 1),
    ]);
    expect(result).toEqual(["Yemen", "Sudan"]);
  });

  it("drops what one newsroom alone is covering", () => {
    expect(labels([headline("Mali junta arrests officers", "Outlet A"), headline("Mali attack kills soldiers", "Outlet A")])).toEqual([]);
  });

  it("ignores headlines older than the window, undated ones and digests", () => {
    expect(
      labels([
        headline("Sudan fighting continues", "Outlet A", 30),
        headline("Sudan fighting continues again", "Outlet B", 0, { publishedAt: null }),
        headline("News in brief: Sudan war, Haiti crisis", "Outlet C"),
        headline("Sudan aid blocked by fighting", "Outlet D"),
      ]),
    ).toEqual([]);
  });

  it("counts only conflict and crisis stories, so sport and trade do not trend", () => {
    expect(
      labels([
        headline("Turkey beat Spain in friendly", "Outlet A"),
        headline("Turkey trade surplus widens", "Outlet B"),
        headline("Jordan scores 30 as Bulls win", "Outlet C"),
        headline("Chad Smith signs new deal", "Outlet D"),
      ]),
    ).toEqual([]);
  });

  it("does not count a headline that names many places: it is about none of them", () => {
    expect(
      labels([
        headline("Strikes hit Syria, Iraq and Yemen", "Outlet A"),
        headline("Syria, Iraq, Yemen: attacks overnight", "Outlet B"),
      ]),
    ).toEqual([]);
  });

  it("needs outlets that use the place's own name, which is what the brief searches for", () => {
    // Clustered as Ukraine, but neither headline says "Ukraine": a brief on "Ukraine" would find nothing here.
    expect(labels([headline("Kyiv hit by drones overnight", "Outlet A"), headline("Kharkiv shelling kills two", "Outlet B")])).toEqual([]);
    expect(labels([headline("Kyiv hit by drones overnight", "Outlet A"), headline("Ukraine shelling kills two", "Outlet B"), headline("Ukraine war talks stall", "Outlet C")])).toEqual(["Ukraine"]);
  });

  it("counts an outlet reporting on its own country at half weight", () => {
    const result = rank([
      headline("India: clashes in Manipur kill three", "Home A", 1, { outletCountry: "India" }),
      headline("India border clashes, troops killed", "Home B", 1, { outletCountry: "India" }),
      headline("India attack kills police", "Home C", 1, { outletCountry: "India" }),
      headline("Somalia al Shabaab attack kills soldiers", "Outlet A"),
      headline("Somalia attack in Mogadishu", "Outlet B"),
    ]).clusters;
    expect(result.map((c) => c.label)).toEqual(["Somalia", "India"]);
    expect(result[1]?.outletCount).toBe(3);
    expect(result[1]?.score).toBeCloseTo(3 * 0.5 * recencyWeight(3_600_000), 3);
  });

  it("is deterministic, reports the newest headline time and the outlets seen, and stops at the limit", () => {
    const many = ["Sudan", "Yemen", "Haiti", "Somalia", "Mali", "Libya", "Iraq", "Syria", "Lebanon"].flatMap((place, i) => [
      headline(`${place} fighting kills ten`, "Outlet A", i + 1),
      headline(`${place} attack reported`, "Outlet B", i + 1.5),
    ]);
    const first = rank(many);
    expect(rank([...many].reverse())).toEqual(first);
    expect(first.clusters).toHaveLength(8);
    expect(first.outletCount).toBe(2);
    expect(first.clusters[0]).toMatchObject({ label: "Sudan", newestAt: hoursAgo(1) });
  });

  it("dedupes one headline syndicated under several URLs", () => {
    const [cluster] = rank([
      headline("Sudan fighting kills ten", "Outlet A"),
      headline("Sudan fighting kills ten", "Outlet A", 1, { url: "https://other.example/x" }),
      headline("Sudan aid blocked", "Outlet B"),
    ]).clusters;
    expect(cluster?.headlineCount).toBe(2);
  });
});

describe("recency weight", () => {
  it("is 1 for a new headline, falls to 0.25 at the end of the window and never below", () => {
    expect(recencyWeight(0)).toBe(1);
    expect(recencyWeight(12 * 3_600_000)).toBeCloseTo(0.625);
    expect(recencyWeight(24 * 3_600_000)).toBe(0.25);
    expect(recencyWeight(48 * 3_600_000)).toBe(0.25);
  });
});
