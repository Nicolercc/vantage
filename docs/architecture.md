# Architecture

How a brief is built, and why. The [README](../README.md) has the overview and a diagram.

## Inputs

* **Topic:** a conflict, crisis or country, such as "Sudan" or "Red Sea shipping tensions".
* **Article link:** the public page is fetched through a guarded fetch (http(s) only, default ports, private and reserved addresses refused at connect time and on every redirect, 3 MB and time caps). The extracted text is cut to its first 8,000 characters.
* **Pasted article text:** 50–8,000 characters, the most the writer reads. The text stays in the originating browser tab (session storage plus an opaque id in the address), is sent to the API to be briefed, and is never stored with the saved brief.

## Retrieval

`src/brief/retrieval` queries every provider concurrently: 19 publisher RSS feeds, Bing News search (its public RSS output), Wikipedia, and the reader's article if there is one. Each provider reports its own outcome (`ok`, `empty`, `failed`), so a failure is visible in the brief instead of looking like "no coverage". The providers are awaited together, so the slowest bounds retrieval; each fetch has a deadline.

`src/brief/sources.ts` then keeps items that match the topic, removes duplicates, caps each outlet, spreads the selection across countries and assigns ids (`S1`, `S2`…). Feed and search items supply a headline and a short summary, not a full article.

## Writing and checking

1. **Writer.** `src/brief/prompt.ts` holds a constant system prompt. Sources travel in the user turn inside `<source>` blocks, with markup stripped so a source cannot close its own block. A test feeds a headline reading "IGNORE ALL PREVIOUS INSTRUCTIONS" and asserts it reaches only the user turn. This keeps retrieved text out of the instructions; it is not proof against prompt injection, and no adversarial evaluation against a live model has been run.
2. **Quote checks, no model** (`src/brief/support.ts`). For every key fact and comparison the model must copy the words in each cited source that the claim rests on. A claim is dropped when a quote is not in the source it names, when a figure in the claim is not inside its quotes (or the source's publication date), or when the claim shares no vocabulary with its quotes. A comparison needs quotes from two sources.
3. **Verifier** (`src/brief/verify.ts`). A second model reads each surviving claim next to its quotes and answers `supported`, `partly` or `unsupported`. Supported claims are labelled verified. A partly supported claim may be rewritten to say only what its quotes say; the rewrite must pass the quote checks again and then be judged `supported` in a second verifier call, or it is removed. If the verifier cannot be reached or answers with anything but well-formed verdicts, the claims are served marked "unverified" and the brief says the check did not run.
4. **Contract.** The brief is parsed against the Zod schema generated from `lib/api-spec/openapi.yaml`. Provenance fields (id, generation time, sources, retrieval outcomes) are set by the server, never taken from the model. An unusable answer, or a provider failure within 10 seconds, gets one more attempt; then the request fails with a typed error. Each writer call has a 60-second deadline and no SDK retries. The whole brief, from retrieval to geocoding, is capped at the sum of every step's limit plus 5 seconds (`BRIEF_DEADLINE_MS`, about 4.3 minutes by default); at that point everything still running is aborted and the request fails with `TIMED_OUT`, never with a partial brief.
5. **Map.** `src/brief/geocode.ts` looks every named place up with Nominatim, at most one request per configured gap. A pin is drawn only when the lookup and the model's own estimate are within 300 km of each other. A country-sized result, a failed lookup or a disagreement leaves the place off the map. A brief waits at most `GEOCODER_BUDGET_MS` for its places; lookups that would start later take no slot in the queue, and running ones are aborted.

Dates on sources come from the provider or are `null`. The generation time is stamped once by the server and survives caching.

On a hand-labelled set (`eval/claim-check-set.json`, run in CI by `claim-set.test.ts`), the quote checks stop 8 of 11 unsupported claims and keep all 9 supported ones. The stored evaluation run records the verifier handling the remaining 3. That run is historical and predates the re-verification of rewrites.

## Serving

* **Streaming.** `POST /api/intelligence/stream` sends server-sent events: the stage, then the sources found, then the whole brief (or an error). The brief is not streamed in parts, because its claims are checked before anything is shown.
* **Deduplication and caching.** Identical concurrent requests share one generation (per process). Briefs are cached with a TTL and a size bound, failures are not cached, and a brief saved within the TTL is reused.
* **Limits.** A per-client rate limit (clients are stored as a keyed hash), a concurrency cap (per process) and a daily generation budget. With Postgres the rate limit and budget are shared by instances; if the database fails, each process continues from the counts it last saw.
* **Errors.** One shape, `{ "error": CODE, "message": "…", "requestId": "…" }`. Provider messages are logged, never returned. Codes: `INVALID_INPUT`, `FETCH_BLOCKED`, `FETCH_FAILED`, `RATE_LIMITED`, `OVERLOADED`, `PROVIDER_UNAVAILABLE`, `MODEL_OUTPUT_INVALID`, `TIMED_OUT`, `INTERNAL`.
* **Headers.** The site sends a content-security policy limited to its own scripts, fonts, map tiles and the API; the API sends `default-src 'none'`, `nosniff` and HSTS.
* **Bodies.** JSON request bodies are capped at 64 KB. A test sends a malformed gzip body to the server in a child process and checks it keeps answering.

## API

```http
POST /api/intelligence/stream   { "topic": "…" } | { "url": "https://…" } | { "article": "…" }
POST /api/intelligence/explore  { "topic": "Sudan civil war" }
POST /api/intelligence/analyze  { "article": "Article text…" } or { "url": "https://…" }
GET  /api/briefs/{id}           a saved brief, exactly as first generated
GET  /api/healthz               the process is up
GET  /api/readyz                ready to serve, and whether storage is durable
GET  /api/ops/costs?days=7      model spend per day (needs the operations token)
```

## Client

React 19 with Vite, TanStack Query (generated client), Tailwind CSS and Leaflet with OpenStreetMap tiles. Every section of a brief carries a tag saying where its content comes from ("From retrieved reporting", "Model background", "Retrieved, not written by the model"). Citations open their quote on click and close with Escape. Homepage text is at least 11px with 4.5:1 contrast, checked by a stylesheet test. A browser audit has covered only synthetic briefs, and the map's markers use hover tooltips.

## Repository

```text
artifacts/
  vantage/                  React client
  api-server/
    src/brief/              retrieval, prompt, generation, claim checks, geocoding
    src/lib/                config, storage, limits, ledger, safe fetch
    src/routes/             HTTP routes
    eval/                   recorded topics, grader, thresholds, reports
lib/
  api-spec/                 OpenAPI contract and codegen config
  api-zod/                  generated Zod schemas
  api-client-react/         generated React Query client
  integrations-anthropic-ai/
.github/workflows/          CI, evaluation, uptime
Dockerfile, render.yaml     API image and Render blueprint
```

## Why I built it, and what I learned

Following an international conflict often means piecing together breaking-news reports, historical references, casualty figures, maps and competing political narratives. The question behind Vantage was how a system can turn that fragmented information into a structured, explorable brief without reducing a complex event to a single narrative.

The project meant reasoning about a whole system: where retrieved data ends and generated text begins, how to give nondeterministic model output deterministic checks, how failures in optional dependencies should reach the reader, how caching changes latency and cost, and how to state an AI product's limits honestly.
