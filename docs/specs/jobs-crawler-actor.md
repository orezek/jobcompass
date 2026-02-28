# Spec: `jobs-crawler-actor`

## Status

- Scope: current implementation in `apps/jobs-crawler-actor`
- Role: upstream crawler/orchestrator in the JobCompass pipeline

## Purpose

The crawler discovers jobs from `jobs.cz`, reconciles them against crawl state, fetches detail HTML only for selected jobs, writes shared local artifacts for ingestion, and optionally triggers ingestion.

## Core Design

### Search spaces

Search spaces are the primary human-maintained crawl configuration.

Location:

- `apps/jobs-crawler-actor/search-spaces/*.json`

Each search space owns:

- `searchSpaceId`
- `description`
- `startUrls`
- crawl defaults
- reconciliation policy
- optional ingestion default

### Runtime input

The runtime consumes Apify-compatible actor input keyed by:

- `searchSpaceId`
- optional overrides

The actor resolves `startUrls` and crawl defaults from the checked-in search-space config at runtime.

### Database naming

Default DB derivation:

- `<JOB_COMPASS_DB_PREFIX>-<searchSpaceId>`

Optional override:

- `MONGODB_DB_NAME`

## Responsibilities

Owned here:

- list crawling
- listing extraction
- reconciliation in `crawl_job_states`
- detail snapshot capture
- crawl run summaries
- local artifact handoff
- ingestion trigger

Not owned here:

- text cleaning
- LLM extraction
- normalized output documents

## Reconciliation Safety

Search-space field:

- `reconciliation.allowInactiveMarkingOnPartialRuns`

Meaning:

- full run: inactive marking allowed
- partial run: missing jobs are not marked inactive unless explicitly allowed

This rule is explicit and must not be inferred from DB naming.

## Trigger Contract

Trigger payload sent to ingestion:

```json
{
  "source": "jobs.cz",
  "crawlRunId": "<crawlRunId>",
  "searchSpaceId": "prague-tech-jobs",
  "mongoDbName": "job-compass-prague-tech-jobs"
}
```

## Shared Local Artifacts

Output layout:

```text
<LOCAL_SHARED_SCRAPED_JOBS_DIR>/
  runs/
    <crawlRunId>/
      dataset.json
      records/
        job-html-<sourceId>.html
```

## Important Runtime Fields

Actor input:

- `searchSpaceId`
- `maxItems`
- `maxConcurrency`
- `maxRequestsPerMinute`
- `proxyConfiguration`
- `debugLog`
- `allowInactiveMarkingOnPartialRuns`

Env:

- `JOB_COMPASS_DB_PREFIX`
- `MONGODB_DB_NAME`
- `MONGODB_URI`
- `MONGODB_CRAWL_JOBS_COLLECTION`
- `ENABLE_MONGO_RUN_SUMMARY_WRITE`
- `MONGODB_CRAWL_RUN_SUMMARIES_COLLECTION`
- `LOCAL_SHARED_SCRAPED_JOBS_DIR`
- `ENABLE_INGESTION_TRIGGER`
- `INGESTION_TRIGGER_URL`

## Local Operator Flow

Run locally:

```bash
pnpm -C apps/jobs-crawler-actor start -- --search-space prague-tech-jobs --max-items 100
```
