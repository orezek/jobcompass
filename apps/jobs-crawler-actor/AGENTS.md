# Job Compass Actor Agent Instructions

These instructions are app-local extensions of the repository root rules.

## Inheritance (Mandatory)

- Always apply root `AGENTS.md` first.
- Always apply `.aiassistant/rules/monorepo.md`.
- This file may add stricter local constraints but must not weaken root rules.
- If this file conflicts with root rules, root rules win.

## Scope

- This file applies to the app directory that contains this file (`./**`).
- Do not treat these rules as global to other apps or packages.

## App-Specific Constraints

- Preserve the current runtime entrypoint unless explicitly requested to refactor:
  - `build` -> `tsc`
  - `start` -> `node ./dist/main.js`
- Keep Apify actor metadata in `.actor/**` consistent with app behavior when changing scripts, Dockerfile, or README.
- Keep dependency style aligned with repo standards: internal packages as `workspace:*`.
- Keep dependency style aligned with repo standards: external shared dependencies as `catalog:`.
- Maintain TypeScript config inheritance via `@repo/typescript-config/node-lib.json`.
- Keep ESLint flat config extending `@repo/eslint-config`.
- Keep env loading type-safe through `@repo/env-config` + schema validation.

## Runtime Note

- This app is designed for Apify actor images and currently targets a Node 20 runtime there.
- Do not change the runtime image or Node compatibility level unless explicitly requested.

## App Purpose & Boundaries (MVP)

- This app is the crawler/orchestrator for the jobs.cz MVP pipeline.
- It is responsible for:
  - crawling list pages,
  - reconciling against `crawl_job_states` in MongoDB,
  - fetching detail pages only for selected jobs,
  - writing shared local crawl artifacts for ingestion,
  - optionally triggering `jobs-ingestion-service` via Fastify.
- It is **not** responsible for LLM parsing/normalization of job ads (that belongs to `jobs-ingestion-service`).

## Search-Space Driven Scope (Important)

- The crawler is generic for `jobs.cz` search URLs.
- Human-maintained crawl scope is defined through checked-in search spaces:
  - `search-spaces/*.json`
- Each search space owns:
  - `searchSpaceId`
  - `startUrls`
  - crawl defaults
  - reconciliation policy
- Current known search spaces include:
  - `default`
  - `prague-tech-jobs`
- Do not hardcode fixed-scope behavior in runtime logic when a search-space config can express it.

## Incremental Crawl State Semantics

- Crawl-state collection: `crawl_job_states` (configurable name via env)
- DB name is configurable via `MONGODB_DB_NAME`.
- Detail scraping selection is based on **existence of `(source, sourceId)` in `crawl_job_states`**, not `isActive`.
- `isActive` is currently used for active/inactive bookkeeping and reporting, not for detail-fetch dedupe.

## Reconciliation Policy (Critical)

- Partial runs can corrupt crawl state if they mark unseen jobs inactive.
- This must be controlled explicitly per search space:
  - `reconciliation.allowInactiveMarkingOnPartialRuns`
- Recommended default is `false`.
- Behavior:
  - full run: inactive marking allowed
  - partial run: missing jobs must not be marked inactive unless explicitly allowed
- Do not infer this safety rule from DB naming.

## Local Shared Output Contract (Crawler -> Ingestion)

- The actor writes crawl artifacts to a local shared directory for ingestion:
  - `LOCAL_SHARED_SCRAPED_JOBS_DIR` (default: `../jobs-ingestion-service/scrapped_jobs`)
- Per-run outputs are written under:
  - `.../runs/<crawlRunId>/`
- Each run folder contains:
  - `dataset.json` (listing records)
  - `records/*.html` (detail page HTML dumps)

## Ingestion Trigger Contract (Optional)

- When enabled, the actor calls `jobs-ingestion-service` after crawl finalization:
  - `ENABLE_INGESTION_TRIGGER=true`
  - `INGESTION_TRIGGER_URL=http://127.0.0.1:<port>/ingestion/start`
- Trigger payload must include:
  - `source`
  - `crawlRunId`
  - `searchSpaceId`
  - `mongoDbName`
- The ingestion service is expected to be idempotent.

## Run Summary Expectations

- `RUN_SUMMARY` and Mongo crawl summaries are operational artifacts and must reflect:
  - list phase / detail phase completion,
  - whether partial-scan guard was triggered,
  - crawl-state DB/collection actually used,
  - parsed list-page total (observational only, not control logic).
- `parsedListingResultsCountTotal` is page-reported and should not be treated as a crawler correctness metric.

## Testing Guidance (Local)

- Prefer the canonical runtime flow:
  - `pnpm -C apps/jobs-crawler-actor start -- --search-space <id>`
- Search spaces are the human-maintained crawl config surface.
- Actor input should be treated as:
  - `searchSpaceId`
  - optional overrides
- For automated tests / ad-hoc verification:
  - prefer `CRAWLEE_STORAGE_DIR=$(mktemp -d ...)`
  - disable ingestion trigger unless needed
  - prefer a dedicated search space or explicit `MONGODB_DB_NAME` override
- Avoid relying on implicit DB semantics when search-space-derived DB naming is available.
