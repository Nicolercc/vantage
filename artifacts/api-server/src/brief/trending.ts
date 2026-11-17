import { CONFLICT_VOCABULARY, ROUNDUP, normalise, topicMatcher } from "./sources";

/**
 * What is most covered right now, worked out from headlines alone: which
 * places conflict and crisis headlines name, and how many different outlets
 * named each one recently. Counting, not a model: the same headlines always
 * give the same ranking, and every number shown can be traced to them.
 */

export type Headline = {
  title: string;
  publisher: string;
  url: string;
  publishedAt: string | null;
  /** Where the outlet is based, when known. */
  outletCountry?: string | null;
};

export type Place = {
  /** Shown to the reader and used as the brief's topic. */
  label: string;
  /** The country the place is in, or the closest honest description. */
  country: string;
  /** Lower-case names that identify the place in a headline: the name, demonyms, capitals, key cities. */
  names: string[];
};

const place = (label: string, country: string, ...names: string[]): Place => ({
  label,
  country,
  names: [label.toLowerCase(), ...names],
});

/**
 * The places Vantage briefs: where wars, armed conflicts and humanitarian
 * crises are reported, not every country that takes part in them. A headline
 * about Washington or London sending aid is counted for the place receiving it.
 *
 * Georgia is left out: in English-language headlines it is usually the US
 * state. "Chad", "Jordan" and "Turkey" are also a name or a bird, and every
 * headline must carry a conflict word (see CRISIS_WORDS) to count at all.
 */
export const PLACES: Place[] = [
  place("Ukraine", "Ukraine", "ukrainian", "ukrainians", "kyiv", "kharkiv", "zaporizhzhia", "odesa", "donetsk", "donbas", "kherson"),
  place("Russia", "Russia", "russian", "russians", "moscow", "kremlin", "putin"),
  place("Gaza", "Palestinian territories", "gazan", "gazans", "rafah", "khan younis", "hamas"),
  place("West Bank", "Palestinian territories", "jenin", "ramallah", "nablus"),
  place("Israel", "Israel", "israeli", "israelis", "tel aviv", "jerusalem", "netanyahu", "idf"),
  place("Lebanon", "Lebanon", "lebanese", "beirut", "hezbollah"),
  place("Syria", "Syria", "syrian", "syrians", "damascus", "aleppo", "idlib"),
  place("Iran", "Iran", "iranian", "iranians", "tehran"),
  place("Iraq", "Iraq", "iraqi", "iraqis", "baghdad", "mosul"),
  place("Yemen", "Yemen", "yemeni", "houthi", "houthis", "sanaa", "aden"),
  place("Red Sea", "Red Sea (Yemen coast)"),
  place("Sudan", "Sudan", "sudanese", "khartoum", "darfur", "el fasher", "kordofan", "rsf"),
  place("South Sudan", "South Sudan", "south sudanese", "juba"),
  place("Ethiopia", "Ethiopia", "ethiopian", "addis ababa", "tigray", "amhara"),
  place("Eritrea", "Eritrea", "eritrean", "asmara"),
  place("Somalia", "Somalia", "somali", "mogadishu", "al shabaab"),
  place("DR Congo", "Democratic Republic of the Congo", "democratic republic of congo", "democratic republic of the congo", "drc", "congolese", "kinshasa", "goma", "m23"),
  place("Libya", "Libya", "libyan", "tripoli", "benghazi"),
  place("Mali", "Mali", "malian", "bamako"),
  place("Burkina Faso", "Burkina Faso", "burkinabe", "ouagadougou"),
  place("Niger", "Niger", "niamey"),
  place("Nigeria", "Nigeria", "nigerian", "nigerians", "abuja", "lagos", "boko haram", "borno"),
  place("Cameroon", "Cameroon", "cameroonian", "yaounde"),
  place("Chad", "Chad", "chadian", "n'djamena"),
  place("Central African Republic", "Central African Republic"),
  place("Mozambique", "Mozambique", "mozambican", "maputo", "cabo delgado"),
  place("Haiti", "Haiti", "haitian", "haitians", "port au prince"),
  place("Venezuela", "Venezuela", "venezuelan", "venezuelans", "caracas", "maduro"),
  place("Colombia", "Colombia", "colombian", "bogota"),
  place("Mexico", "Mexico", "mexican", "cartel", "cartels"),
  place("Ecuador", "Ecuador", "ecuadorian", "quito"),
  place("Afghanistan", "Afghanistan", "afghan", "afghans", "kabul", "taliban"),
  place("Pakistan", "Pakistan", "pakistani", "islamabad", "karachi", "lahore", "balochistan"),
  place("India", "India", "indian", "new delhi", "manipur"),
  place("Kashmir", "India and Pakistan", "kashmiri"),
  place("Myanmar", "Myanmar", "burmese", "burma", "naypyidaw", "rakhine", "rohingya"),
  place("Bangladesh", "Bangladesh", "bangladeshi", "dhaka"),
  place("Taiwan", "Taiwan", "taiwanese", "taipei"),
  place("China", "China", "chinese", "beijing"),
  place("North Korea", "North Korea", "north korean", "pyongyang", "kim jong un"),
  place("South Korea", "South Korea", "south korean", "seoul"),
  place("South China Sea", "South China Sea"),
  place("Philippines", "Philippines", "philippine", "filipino", "manila"),
  place("Armenia", "Armenia", "armenian", "yerevan"),
  place("Azerbaijan", "Azerbaijan", "azerbaijani", "baku"),
  place("Nagorno-Karabakh", "Azerbaijan", "nagorno karabakh", "karabakh"),
  place("Serbia", "Serbia", "serbian", "belgrade"),
  place("Kosovo", "Kosovo", "kosovar", "pristina"),
  place("Turkey", "Turkey", "turkiye", "türkiye", "turkish", "ankara", "erdogan"),
  place("Jordan", "Jordan", "jordanian", "amman"),
  place("Egypt", "Egypt", "egyptian", "cairo"),
  place("Saudi Arabia", "Saudi Arabia", "saudi", "riyadh"),
  place("Western Sahara", "Western Sahara", "polisario"),
  place("Sahel", "Sahel region"),
];

/**
 * Conflict and crisis words. A headline counts only when it carries one, so a
 * football result or a trade figure does not make a place "most covered".
 */
export const CRISIS_WORDS = new Set([
  ...CONFLICT_VOCABULARY,
  "killed", "kills", "kill", "dead", "deaths", "death", "wounded", "injured", "casualties",
  "missile", "missiles", "drone", "drones", "rocket", "rockets", "bomb", "bombs", "bombing", "bombings",
  "shelling", "shelled", "raid", "raids", "clashes", "clash", "battle", "rebels", "rebel", "militants",
  "militant", "militia", "militias", "insurgents", "jihadists", "hostage", "hostages", "captives",
  "massacre", "genocide", "famine", "hunger", "starvation", "displaced", "evacuate", "evacuation",
  "blockade", "occupation", "occupied", "annex", "annexation", "junta", "martial", "unrest", "riot",
  "riots", "crackdown", "arrests", "executed", "nuclear", "war's", "warplanes", "gunmen", "kidnapped",
  "abducted", "airstrike", "invade", "invaded", "retaliation", "escalation", "escalates",
  "sanction", "ceasefires", "truce", "armistice", "peacekeepers", "peacekeeping",
]);

/** A headline names this place and nothing longer that contains it ("South Sudan" is not "Sudan"). */
function placesNamed(title: string): Place[] {
  let haystack = normalise(title.replace(/-/g, " "));
  const found = new Map<string, Place>();
  // Longest names first, each blanked out once found, so a short name never
  // matches inside a longer one.
  for (const { name, p } of NAME_INDEX) {
    const needle = ` ${name} `;
    if (!haystack.includes(needle)) continue;
    found.set(p.label, p);
    haystack = haystack.split(needle).join(" | ");
  }
  return [...found.values()];
}

const NAME_INDEX = PLACES.flatMap((p) => p.names.map((name) => ({ name: normalise(name).trim(), p }))).sort(
  (a, b) => b.name.length - a.name.length,
);

const matchers = new Map<string, (text: string) => boolean>();
const matcherFor = (label: string) => {
  let m = matchers.get(label);
  if (!m) matchers.set(label, (m = topicMatcher(label)));
  return m;
};

const isAboutCrisis = (title: string) => normalise(title).trim().split(" ").some((w) => CRISIS_WORDS.has(w));

export type TrendingCluster = {
  label: string;
  country: string;
  outletCount: number;
  headlineCount: number;
  newestAt: string;
  /** The newest headline counted, as a sample of what the coverage is about. */
  headline: { title: string; publisher: string; url: string };
  score: number;
};

export type RankOptions = {
  now?: number;
  windowMs?: number;
  limit?: number;
  /** Fewer outlets than this is one newsroom's interest, not something "most covered". */
  minOutlets?: number;
  /** A headline naming more places than this is a round-up, not about any of them. */
  maxPlacesPerHeadline?: number;
};

export const TRENDING_WINDOW_MS = 24 * 3_600_000;

/** How much a headline of this age counts: 1 when new, falling to 0.25 at the end of the window. */
export const recencyWeight = (ageMs: number, windowMs = TRENDING_WINDOW_MS) =>
  Math.max(0.25, 1 - (0.75 * Math.max(0, ageMs)) / windowMs);

/**
 * Group recent headlines by the place they name and rank the places. Each
 * outlet counts once per place, weighted by how recent its newest headline
 * about that place is: ten headlines from one outlet do not outrank one each
 * from five outlets.
 */
export function rankTrending(headlines: Headline[], options: RankOptions = {}) {
  const {
    now = Date.now(),
    windowMs = TRENDING_WINDOW_MS,
    limit = 8,
    minOutlets = 2,
    maxPlacesPerHeadline = 2,
  } = options;

  const seen = new Set<string>();
  const outlets = new Set<string>();
  type Entry = {
    place: Place;
    newestByOutlet: Map<string, number>;
    home: Set<string>;
    findable: Set<string>;
    headlines: number;
    newest: { at: number; headline: Headline } | null;
  };
  const byPlace = new Map<string, Entry>();

  for (const h of headlines) {
    const at = h.publishedAt ? Date.parse(h.publishedAt) : NaN;
    // Undated items cannot be placed in the window; items "from the future" are clock skew, counted as now.
    if (!Number.isFinite(at) || now - at > windowMs) continue;
    const title = h.title.trim();
    const key = normalise(title).trim();
    if (!key || seen.has(key) || ROUNDUP.test(title)) continue;
    seen.add(key);
    const outlet = h.publisher.trim().toLowerCase();
    if (!outlet) continue;
    outlets.add(outlet);
    if (!isAboutCrisis(title)) continue;
    const places = placesNamed(title);
    if (places.length === 0 || places.length > maxPlacesPerHeadline) continue;
    const when = Math.min(at, now);
    for (const p of places) {
      const entry = byPlace.get(p.label) ?? { place: p, newestByOutlet: new Map(), home: new Set(), findable: new Set(), headlines: 0, newest: null };
      entry.headlines += 1;
      // Ties are broken by title, so the same headlines in any order give the same sample.
      if (!entry.newest || when > entry.newest.at || (when === entry.newest.at && title < entry.newest.headline.title)) {
        entry.newest = { at: when, headline: { ...h, title } };
      }
      entry.newestByOutlet.set(outlet, Math.max(entry.newestByOutlet.get(outlet) ?? 0, when));
      if (h.outletCountry && h.outletCountry === p.country) entry.home.add(outlet);
      if (matcherFor(p.label)(title)) entry.findable.add(outlet);
      byPlace.set(p.label, entry);
    }
  }

  const clusters: TrendingCluster[] = [];
  for (const { place: p, newestByOutlet, home, findable, headlines: count, newest } of byPlace.values()) {
    if (newestByOutlet.size < minOutlets || !newest) continue;
    // The brief searches for the label itself. If too few outlets used that
    // word ("Kyiv says…" never says "Ukraine"), the brief would be thin.
    if (findable.size < minOutlets) continue;
    const times = [...newestByOutlet.values()];
    // An outlet covering its own country is reporting local news; it counts half.
    const score = [...newestByOutlet].reduce(
      (sum, [outlet, t]) => sum + recencyWeight(now - t, windowMs) * (home.has(outlet) ? 0.5 : 1),
      0,
    );
    clusters.push({
      label: p.label,
      country: p.country,
      outletCount: newestByOutlet.size,
      headlineCount: count,
      newestAt: new Date(Math.max(...times)).toISOString(),
      headline: { title: newest.headline.title, publisher: newest.headline.publisher, url: newest.headline.url },
      score: Math.round(score * 1000) / 1000,
    });
  }

  clusters.sort(
    (a, b) =>
      b.score - a.score ||
      b.outletCount - a.outletCount ||
      b.newestAt.localeCompare(a.newestAt) ||
      a.label.localeCompare(b.label),
  );
  return { clusters: clusters.slice(0, limit), outletCount: outlets.size };
}

export { placesNamed as placesInHeadline };
