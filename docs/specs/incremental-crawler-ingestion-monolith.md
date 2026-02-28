# Search-Space Driven Incremental Crawl + Ingestion Spec

## Status

Implemented target architecture for the current MVP workflow.

## Purpose

Keep the crawler generic for `jobs.cz` while preserving:

- incremental crawl efficiency
- Apify compatibility
- simple local operation
- per-search-space database isolation
- explicit safety around inactive marking

Crawler and ingestion remain separate apps in the monorepo, but the integration contract is now driven by **search spaces** instead of hardcoded run conventions.

## Core Design

### 1. Search spaces are the human-maintained crawl config

Search spaces live in:

- `apps/jobs-crawler-actor/search-spaces/*.json`

Each search space defines:

- `searchSpaceId`
- `description`
- `startUrls`
- crawl defaults
- reconciliation policy
- optional ingestion default

### 2. Actor input selects the search space at runtime

The crawler runtime still consumes standard actor input, but the canonical operator input is:

- `searchSpaceId`
- optional overrides

This preserves:

- local operator ergonomics
- Apify compatibility

### 3. Database identity is derived from the search space

Default DB rule:

- `<JOB_COMPASS_DB_PREFIX>-<searchSpaceId>`

Example:

- `JOB_COMPASS_DB_PREFIX=job-compass`
- `searchSpaceId=prague-tech-jobs`
- resolved DB: `job-compass-prague-tech-jobs`

Optional explicit override:

- `MONGODB_DB_NAME`

### 4. Partial inactive marking is controlled explicitly

This is not inferred from prod/dev naming.

Each search space contains:

- `reconciliation.allowInactiveMarkingOnPartialRuns`

Recommended default:

- `false`

Meaning:

- full run: missing jobs may be marked inactive
- partial run: missing jobs must not be marked inactive unless explicitly allowed

## Application Split

### `apps/jobs-crawler-actor`

Owns:

- list crawl
- listing extraction
- reconciliation against `crawl_job_states`
- detail fetch for selected jobs
- HTML snapshot persistence
- crawl summaries
- local handoff artifacts
- ingestion trigger

### `apps/jobs-ingestion-service`

Owns:

- ingestion trigger endpoint
- idempotent trigger handling
- HTML/text parsing and completeness checks
- LLM cleaning
- LLM structured extraction
- normalized output persistence
- ingestion summaries
- pruning non-success jobs from `crawl_job_states`

## Search Space Schema

Current shape:

```json
{
  "searchSpaceId": "prague-tech-jobs",
  "description": "Praha, 0 km, selected IT and engineering categories",
  "startUrls": [
    "https://www.jobs.cz/prace/praha/?field%5B%5D=200900012&field%5B%5D=200900013&field%5B%5D=200900011&field%5B%5D=200900033&locality%5Bradius%5D=0"
  ],
  "crawlDefaults": {
    "maxItems": 2000,
    "maxConcurrency": 1,
    "maxRequestsPerMinute": 10,
    "debugLog": false,
    "proxyConfiguration": {
      "useApifyProxy": false
    }
  },
  "reconciliation": {
    "allowInactiveMarkingOnPartialRuns": false
  },
  "ingestion": {
    "triggerEnabledByDefault": true
  }
}
```

## Runtime Actor Input

Operator-facing actor input is:

```json
{
  "searchSpaceId": "prague-tech-jobs",
  "maxItems": 2000
}
```

The actor resolves `startUrls`, crawl defaults, and reconciliation policy from the checked-in search-space definition.

## Local Operator Workflow

### Run locally

```bash
pnpm -C apps/jobs-crawler-actor start -- --search-space prague-tech-jobs --max-items 100
```

## Crawl Algorithm

### Phase 1. List crawl

- crawl list pages
- extract listing cards
- collect listing records in memory
- track run-level counters

### Phase 2. Reconciliation

Against `crawl_job_states` in the resolved search-space DB:

- unseen job -> classify `new`, keep active, enqueue for detail fetch
- existing job -> keep active, update `lastSeenAt`, update `lastSeenRunId`

### Phase 3. Detail fetch

Only for the selected jobs from reconciliation:

- fetch detail page
- wait for template-specific readiness
- capture final rendered HTML
- persist HTML snapshot metadata

### Phase 4. Inactive marking

Missing jobs are marked inactive only when allowed by the search-space reconciliation policy.

If the run is partial and:

- `allowInactiveMarkingOnPartialRuns=false`

then inactive marking is skipped.

## Crawl State Collection

Collection:

- `crawl_job_states`

Purpose:

- crawl-owned memory
- dedupe for detail fetching
- active/inactive bookkeeping
- latest listing snapshot
- latest detail snapshot metadata

Important rule:

- detail-fetch dedupe is based on existence in crawl state, not `isActive`

## Local Handoff Contract

Crawler writes:

```text
<LOCAL_SHARED_SCRAPED_JOBS_DIR>/
  runs/
    <crawlRunId>/
      dataset.json
      records/
        job-html-<sourceId>.html
```

Default:

- `../jobs-ingestion-service/scrapped_jobs`

## Trigger Contract

Endpoint:

- `POST /ingestion/start`

Payload:

```json
{
  "source": "jobs.cz",
  "crawlRunId": "<crawlRunId>",
  "searchSpaceId": "prague-tech-jobs",
  "mongoDbName": "job-compass-prague-tech-jobs"
}
```

Reason:

- the ingestion service must know both artifact identity and target database identity
- no hidden DB assumptions should exist between the two apps

## Ingestion DB Resolution

Manual/default ingestion runs:

- `<JOB_COMPASS_DB_PREFIX>-<SEARCH_SPACE_ID>`

Triggered runs:

- use explicit `mongoDbName` from the crawler trigger payload

## Why non-success ingestion prunes crawl state

If ingestion skips or fails a job:

- remove it from `crawl_job_states`

This allows the crawler to fetch it again on the next run without adding ingestion-specific lifecycle state into crawl state.

## Current Search Spaces

### `default`

- generic `https://www.jobs.cz/prace/`
- safe baseline for generic use

### `prague-tech-jobs`

- current Prague tech dataset
- used as the main operational sample for ETL and product work

## Env Model

### Crawler

- infrastructure/runtime:
  - `JOB_COMPASS_DB_PREFIX`
  - `MONGODB_URI`
  - `MONGODB_DB_NAME`
  - `LOCAL_SHARED_SCRAPED_JOBS_DIR`
  - `INGESTION_TRIGGER_URL`
- search-space behavior:
  - not in env
  - lives in `search-spaces/*.json`

### Ingestion

- infrastructure/runtime:
  - `JOB_COMPASS_DB_PREFIX`
  - `SEARCH_SPACE_ID`
  - `MONGODB_DB_NAME`
  - `MONGODB_URI`
  - ports / input dirs / model settings
- trigger-driven run identity:
  - explicit payload values from crawler

## Operational Invariants

1. Search space is the source of operational intent.
2. Apify input is the runtime contract.
3. DB naming is derived from the search space unless explicitly overridden.
4. Partial inactive marking must never be inferred from DB naming.
5. Crawler and ingestion must agree on the target DB through explicit trigger payload.
