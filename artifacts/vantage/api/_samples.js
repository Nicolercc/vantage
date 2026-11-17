/**
 * What link-preview crawlers need from each reviewed sample brief.
 *
 * The sample itself lives in src/samples/ and ships inside the app. Edge
 * functions are built separately, so instead of importing that JSON this
 * keeps the few preview fields by hand; src/lib/brief-preview.test.ts fails
 * the build if they ever differ from the sample file.
 */

/** @type {{ [slug: string]: import("./_preview.js").PreviewBrief }} */
export const SAMPLE_PREVIEWS = {
	"sudan-2026-11-16": {
		"id": "dgUvNi4N3nPj",
		"sample": "sudan-2026-11-16",
		"headline": "Sudan's humanitarian crisis deepens as funding and access collapse",
		"summary": "Sudan's civil war, fought between the Sudanese Armed Forces (SAF) and the Rapid Support Forces (RSF) since April 2023, has created the world's largest active humanitarian crisis. Nearly two-thirds of Sudan's population now need aid, but funding covers only 47% of the required $2.9 billion, while drone attacks on infrastructure and fuel shortages are paralyzing daily life and blocking aid delivery.",
		"generatedAt": "2026-11-16T04:00:35.708Z",
		"inScope": true,
		"location": {
			"city": "Khartoum",
			"country": "Sudan"
		},
		"sources": [
			{
				"kind": "news",
				"publisher": "Africanews"
			},
			{
				"kind": "news",
				"publisher": "UN News"
			},
			{
				"kind": "news",
				"publisher": "Africanews"
			},
			{
				"kind": "news",
				"publisher": "UN News"
			},
			{
				"kind": "news",
				"publisher": "DW"
			},
			{
				"kind": "news",
				"publisher": "UA.NEWS"
			},
			{
				"kind": "news",
				"publisher": "Oil Price US"
			},
			{
				"kind": "news",
				"publisher": "Al Jazeera"
			},
			{
				"kind": "news",
				"publisher": "allAfrica.com"
			},
			{
				"kind": "news",
				"publisher": "Yahoo"
			},
			{
				"kind": "reference",
				"publisher": "Wikipedia"
			}
		]
	},
};

/** @param {string | null} slug */
export function loadSample(slug) {
	return slug && Object.hasOwn(SAMPLE_PREVIEWS, slug) ? SAMPLE_PREVIEWS[slug] : null;
}
