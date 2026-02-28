# Spec: `jobs-ingestion-service`

## Status

- Scope: current implementation in `apps/jobs-ingestion-service`
- Role: downstream parsing/normalization service in the JobCompass pipeline

## Purpose

The ingestion service reads crawler artifacts, converts detail HTML into clean text, extracts structured job data with Gemini, writes normalized documents, records ingestion summaries, and tracks trigger lifecycle.

## Core Design

### Trigger-driven ingestion

Preferred contract:

```json
{
  "source": "jobs.cz",
  "crawlRunId": "<crawlRunId>",
  "searchSpaceId": "prague-tech-jobs",
  "mongoDbName": "job-compass-prague-tech-jobs"
}
```

This makes each ingestion run explicit about:

- artifact identity
- search-space identity
- target Mongo database

### Database naming

Manual/default ingestion runs derive DB as:

- `<JOB_COMPASS_DB_PREFIX>-<SEARCH_SPACE_ID>`

Trigger-driven runs should use:

- explicit `mongoDbName` from the crawler payload

## Responsibilities

Owned here:

- idempotent trigger API
- HTML load + completeness validation
- deterministic text extraction
- LLM cleaning
- LLM structured extraction
- normalized output writes
- ingestion summaries
- trigger lifecycle tracking
- crawl-state pruning for non-success jobs

Not owned here:

- list crawling
- detail-page fetching
- list reconciliation logic

## Pipeline

1. `loadDetailPage`
   - read HTML
   - parse DOM
   - extract deterministic text
   - run completeness gate

2. `cleanDetailText`
   - prompt: `jobcompass-job-ad-text-cleaner`
   - remove UI/GDPR/cookie/legal noise

3. `extractDetail`
   - prompt: `jobcompass-job-ad-structured-extractor`
   - structured Gemini output validated by local schema

4. `merge`
   - combine listing + extracted detail + ingestion metadata

## Persisted Text Snapshots

Stored in `normalized_job_ads.rawDetailPage`:

- `loadDetailPageText`
- `cleanDetailText`

Raw HTML remains the audit/reprocessing source of truth on disk.

## Completeness Gate

The completeness gate is structural-first:

- prefer known content containers
- evaluate the best candidate container
- keep keyword/noise fallback only for unknown templates

## Mongo Collections

- `normalized_job_ads`
- `crawl_job_states`
- `ingestion_run_summaries`
- `ingestion_trigger_requests`

### Crawl-state prune rule

If ingestion skips or fails a job, remove it from `crawl_job_states` so the crawler can fetch it again on the next run.

## Summary Requirements

Ingestion summaries must contain:

- `searchSpaceId`
- `mongoDbName`
- totals and rates
- skipped/failed audit arrays
- cleaner/extractor/total LLM stats

## Important Runtime Fields

Env:

- `JOB_COMPASS_DB_PREFIX`
- `SEARCH_SPACE_ID`
- `MONGODB_DB_NAME`
- `ENABLE_MONGO_WRITE`
- `MONGODB_URI`
- `MONGODB_JOBS_COLLECTION`
- `MONGODB_CRAWL_JOBS_COLLECTION`
- `MONGODB_RUN_SUMMARIES_COLLECTION`
- `MONGODB_INGESTION_TRIGGERS_COLLECTION`
- `INPUT_ROOT_DIR`
- `CRAWL_RUNS_SUBDIR`
- `INGESTION_API_PORT`
