# Operations

Configuration, health, cost tracking and deployment of the API. Every variable is listed with a description in [`.env.example`](../.env.example).

## Configuration

The API validates its configuration at start-up (`src/lib/config.ts`). It refuses to start if a value is malformed and lists every problem at once. That covers the limits, the writer and verifier timeouts, the verifier switch (`BRIEF_VERIFY`, `on` or `off`), the geocoder gap, budget and URL, the database settings, `OPS_TOKEN` (at least 24 characters) and `MODEL_PRICES`. The model key, database URL and operations token are never echoed. A malformed numeric value is quoted in the message, so keep secrets out of numeric settings.

Locally, the API loads `.env` from its working directory and then from the repository root. Values already in the environment win.

## Health and readiness

* `GET /api/healthz`: the process is up.
* `GET /api/readyz`: whether the instance can do its job and whether what it saves will last (`durable`). It turns not-ready when the model provider refuses a request (revoked key, suspended account, spent credit). It learns this from real requests, so it reports the problem from the first failed brief onwards.

`.github/workflows/uptime.yml` requests the health check and the site every ten minutes. A failing run notifies the repository owner according to their GitHub notification settings; readiness alerts are throttled to one every six hours.

## Storage and limits

With `DATABASE_URL` set, saved briefs, the rate limit, the daily budget and the cost ledger live in Postgres. Every instance shares them and they survive restarts; tables are created on first use. Each statement has a 5-second server-side deadline (2 seconds waiting on a lock), so a stalled database fails fast and the fallbacks run. Without a database everything lives in the process, `/api/readyz` reports `durable: false`, and the server logs a warning. `REQUIRE_DATABASE=true` makes a missing database a start-up error.

## Cost tracking

Every writer and verifier call is recorded with its purpose, model, tokens, duration and, when the model has a configured price, its cost. Recording is best effort and a failed call records zero tokens. `GET /api/ops/costs?days=7` (`Authorization: Bearer $OPS_TOKEN`; the route answers 404 without a configured token) returns totals per day and a cost per brief. The brief count is the number of successful writer calls, so a brief that needed a retry counts twice. Prices for models other than the default are set with `MODEL_PRICES`.

## Logs

Pino writes JSON logs in production. Each request gets an id, returned in the `X-Request-Id` header and in every error body. Each brief logs its token use, source count and how many claims survived the checks.

## Docker

```bash
docker build -t vantage-api .
docker run --rm -p 3001:3001 --env-file .env vantage-api
```

## Render

`render.yaml` describes the API as a Docker web service.

1. Create a Render Blueprint from this repository.
2. When Render asks for unsynced secrets, set `ANTHROPIC_API_KEY`. Optionally set `DATABASE_URL` and `OPS_TOKEN`.
3. Leave `PORT` unset; Render supplies it.
4. Keep `CORS_ORIGINS` set to the frontend origin.
5. Build the frontend (Vercel) with `VITE_API_BASE_URL` set to the API's URL, then redeploy it.

Render checks `/api/healthz`.
