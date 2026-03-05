# Spec Draft: Crawler Worker Adaptation v1

V@v

## Status

- draft
- implementation-facing v1 worker spec

## Purpose

Define how the current `jobs-crawler-actor` should be adapted into the v1 control-plane architecture with minimal behavior change.

The emphasis for v1 is:

- preserve current crawler behavior
- preserve current Mongo-backed reconciliation behavior
- preserve current artifact naming and layout
- replace direct ingestion HTTP triggers with brokered events
- keep internal Apify compatibility

## Scope Boundaries

This spec is intentionally narrow.

In scope for v1:

- `jobs.cz` only
- current list/search-page crawler behavior
- current reconciliation behavior
- current detail HTML capture behavior
- run-manifest driven execution
- Apify-compatible input generation
- artifact-store adapter integration
- broker event publishing
- current crawler summary persistence

Deferred from this spec:

- direct detail-URL runs
- mixed list/detail input classification
- non-Mongo alternative reconciliation model
- production cloud deployment shape

## Current Baseline To Preserve

The v1 crawler adaptation should preserve these current behaviors:

- checked-in search-space semantics become control-plane `SearchSpace` semantics
- list-page crawling remains the primary crawl mode
- reconciliation still uses Mongo-backed `normalized_job_ads`
- detail HTML is persisted before downstream handoff
- run summaries still persist to `crawl_run_summaries`
- artifact naming remains `job-html-<sourceId>.html`
- artifact layout remains run-scoped

## Worker Role In V1

The crawler worker is a runtime worker, not a public product API.

It should:

- consume run commands
- load the immutable run manifest
- generate an Apify-compatible crawler input projection
- execute the crawl
- persist artifacts
- publish detail-captured events
- persist the current crawler summary
- publish crawl lifecycle events

It should not:

- own the operator-facing API
- own the canonical configuration model
- wait for ingestion completion

## Inputs

### Canonical input

The canonical v1 worker input is the immutable `RunManifest`.

Relevant fields:

- `runId`
- `pipelineId`
- `searchSpaceSnapshot`
- `runtimeProfileSnapshot`
- `artifactDestinationSnapshot`
- `structuredOutputDestinationSnapshots`
- `mode`
- `sourceType`

### Apify-compatible projection

The control plane or worker runtime may generate an Apify-compatible `INPUT.json` from the manifest.

This projection should preserve compatibility with the current actor-style crawler input.

The generated projection should contain at least:

- `searchSpaceId`
- `maxItems`
- `maxConcurrency`
- `maxRequestsPerMinute`
- `debugLog`
- `allowInactiveMarkingOnPartialRuns`
- optional `proxyConfiguration`

### Bootstrap environment

Environment variables remain valid in v1 for infrastructure bootstrap and secrets.

Expected bootstrap env includes:

- `MONGODB_URI`
- `JOB_COMPASS_DB_PREFIX`
- `MONGODB_JOBS_COLLECTION`
- `MONGODB_CRAWL_RUN_SUMMARIES_COLLECTION`
- `CRAWL_INACTIVE_GUARD_MIN_ACTIVE_COUNT`
- `CRAWL_INACTIVE_GUARD_MIN_SEEN_RATIO`
- logging configuration
- broker credentials
- storage credentials

Business configuration should not come from env in v1 if it is present in the manifest.

## Run Identity And Lineage

V1 should simplify identity by using the control-plane `runId` as the crawler lineage ID.

Recommended rule:

- `crawlRunId = runId`

Why:

- reduces lineage translation
- preserves current crawl-run-based summary and artifact naming
- keeps event payloads and storage paths simpler

## Execution Flow

### 1. Run command consumption

The worker receives `crawler.run.requested.v1`.

It must:

- validate the payload envelope
- load or deserialize the `RunManifest`
- reject unsupported source types

### 2. Manifest to crawler input projection

The worker creates the crawler runtime input from the manifest.

Mapping rules:

- `searchSpaceSnapshot.id` -> `searchSpaceId`
- runtime overrides -> current actor input fields
- pipeline mode influences whether detail-captured events are published
- artifact destination snapshot influences artifact-store adapter configuration

The worker may optionally persist the generated projection for debugging.

Recommended debug artifact path:

```text
runs/<crawlRunId>/input/INPUT.json
```

### 3. Search-space resolution

V1 should preserve the current search-space-driven crawler model.

That means:

- the crawler still operates on a resolved search space
- `jobs.cz` list-page crawling remains the active mode
- start URLs come from the manifest snapshot, not checked-in files at execution time

### 4. Crawl execution

The worker executes the current list-page crawl logic with the current behavior preserved:

- discover listings
- parse listing cards
- reconcile against `normalized_job_ads`
- identify missing jobs
- fetch detail pages for missing jobs
- persist detail HTML per item

### 5. Artifact persistence

Artifacts must be persisted before downstream handoff.

The worker uses the artifact-store adapter to write:

- detail HTML files
- crawl dataset metadata file

V1 compatibility rule:

- keep the current logical layout and naming

Canonical layout:

```text
runs/<crawlRunId>/
  dataset.json
  records/
    job-html-<sourceId>.html
```

### 6. Downstream event publishing

If the pipeline mode is `crawl_and_ingest`, the worker publishes `crawler.detail.captured.v1` after the HTML artifact is durably written.

If the pipeline mode is `crawl_only`, the worker does not publish detail-captured events.

The publish boundary is:

- HTML artifact written successfully
- artifact reference created successfully

### 7. Summary persistence

The worker continues to persist its current summary model to:

- `crawl_run_summaries`

V1 compatibility rule:

- preserve the current summary shape as the baseline
- any additions must be additive only

### 8. Lifecycle event publishing

The worker also publishes:

- `crawler.run.started.v1`
- `crawler.run.progress.v1`
- `crawler.run.completed.v1`
- `crawler.run.failed.v1`

These events are for control-plane observability and should not replace the Mongo summary in v1.

## Adaptation Architecture

The crawler worker should be split conceptually into the following layers.

### Layer 1: Worker command adapter

Owns:

- broker subscription
- envelope validation
- manifest loading
- run lifecycle event emission

### Layer 2: Input projection adapter

Owns:

- `RunManifest` -> current crawler input mapping
- Apify-compatible `INPUT.json` generation

### Layer 3: Existing crawler core

Owns:

- page crawling
- reconciliation
- detail rendering readiness
- listing parsing
- run summary generation

V1 should reuse as much of the current crawler core as practical.

### Layer 4: Infrastructure adapters

Owns:

- artifact store adapter
- broker publisher
- Mongo summary persistence

## MongoDB Behavior In V1

The crawler worker keeps the current Mongo-backed reconciliation model.

Required behavior:

- use one database per search space
- database name remains `<JOB_COMPASS_DB_PREFIX>-<searchSpaceId>`
- `normalized_job_ads` remains the reconciliation source of truth
- `crawl_run_summaries` remains the crawler summary collection

V1 should not redesign this part.

## Event Publishing Rules

### Detail-captured event

The worker must publish `crawler.detail.captured.v1` only after:

- HTML artifact write succeeded
- dataset metadata state for the item is available
- listing record is available

Suggested payload contents:

- `runId`
- `crawlRunId`
- `searchSpaceId`
- `source`
- `sourceId`
- `listingRecord`
- `artifact`
- `dedupeKey`

### Dedupe key

Recommended v1 dedupe key:

```text
<source>:<searchSpaceId>:<crawlRunId>:<sourceId>
```

## Failure Handling

### Artifact write failure

If artifact persistence fails:

- do not publish the detail-captured event
- count the item as failed in run observability
- continue the run where practical

### Event publish failure

If artifact persistence succeeds but event publish fails:

- preserve the artifact
- record the failure in run summary counters and samples
- mark the run as `completed_with_errors` if the crawl otherwise completes

This mirrors the current best-effort handoff model.

### Reconciliation failure

If Mongo-backed reconciliation fails:

- fail the run
- publish `crawler.run.failed.v1`
- persist the failure in `crawl_run_summaries` when possible

## Crawl-Only Mode In V1

V1 crawl-only mode is a control-plane mode, not a crawler redesign.

That means:

- the current crawler still runs with its current logic
- the difference is that downstream ingestion publish is disabled

V1 does not yet define a new non-Mongo list-crawl mode.

## Local Development Model

V1 local execution should support:

- local control plane
- local crawler worker
- local MongoDB
- local filesystem artifact store
- local broker adapter or real Pub/Sub adapter

The logical flow must remain the same even when all components run locally.

## Recommended Implementation Sequence

1. factor the current crawler core behind a small runtime adapter
2. introduce `RunManifest` input mapping
3. introduce Apify-compatible `INPUT.json` generation
4. replace direct ingestion HTTP trigger with broker publish adapter
5. preserve current Mongo summary writes and artifact layout

## Explicit Non-Goals For V1 Worker Work

- redesigning crawl strategy
- redesigning reconciliation rules
- supporting direct detail URLs
- changing artifact naming
- changing MongoDB layout
