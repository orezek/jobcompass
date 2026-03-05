# Spec Draft: Ingestion Worker Adaptation v1

## Status

- draft
- implementation-facing v1 worker spec

## Purpose

Define how the current `jobs-ingestion-service` should be adapted into the v1 control-plane architecture with minimal behavior change.

The emphasis for v1 is:

- preserve the current parsing and extraction workflow
- preserve the current MongoDB topology and collection names
- preserve the current ingestion summary persistence
- replace direct HTTP item triggering with brokered item events
- keep the current canonical normalized document shape

## Scope Boundaries

In scope for v1:

- event-driven single-item ingestion from crawler artifact events
- optional batch reingestion using the current bulk workflow
- canonical normalized document output
- MongoDB sink compatibility
- JSON sink adapters
- current ingestion summary persistence
- current trigger lifecycle persistence collection reuse

Deferred from this spec:

- output-template selection
- token-saving result reuse cache
- separate downstream writer stage
- deeper persistence decoupling

## Current Baseline To Preserve

The v1 ingestion adaptation should preserve these current behaviors:

- deterministic detail HTML loading and completeness validation
- LLM cleaner step
- LLM extractor step
- canonical normalized document shape
- write to `normalized_job_ads` when MongoDB sink is used
- write ingestion summaries to `ingestion_run_summaries`
- persist item lifecycle in `ingestion_trigger_requests`
- preserve current Mongo database naming and collection names

## Worker Role In V1

The ingestion worker is a runtime worker, not a public product API.

It should:

- consume item-level artifact events
- resolve the run manifest for sink routing and run context
- load artifact content through the artifact-store adapter
- call the existing single-record ingestion workflow
- write the canonical document to configured sinks
- persist current ingestion summaries
- publish ingestion lifecycle events

It should not:

- own the operator-facing API
- own output-template selection
- move sink writes into the broker

## Inputs

### Primary input event

The primary v1 event is:

- `crawler.detail.captured.v1`

Required event data for v1 execution:

- `runId`
- `crawlRunId`
- `searchSpaceId`
- `source`
- `sourceId`
- `listingRecord`
- `artifact`
- `dedupeKey`

### Run manifest lookup

The ingestion worker must resolve the immutable `RunManifest` by `runId`.

Why:

- sink configuration is run-scoped
- artifact destination is run-scoped
- output destinations are run-scoped

V1 acceptable approaches:

- load from control-plane persistence by `runId`
- load from a shared manifest store by `runId`
- load from a local cached manifest copy populated by the control plane

### Bootstrap environment

Environment variables remain valid in v1 for infrastructure bootstrap and secrets.

Expected bootstrap env includes:

- `JOB_COMPASS_DB_PREFIX`
- `MONGODB_URI`
- `MONGODB_JOBS_COLLECTION`
- `MONGODB_RUN_SUMMARIES_COLLECTION`
- `MONGODB_INGESTION_TRIGGERS_COLLECTION`
- LLM credentials
- logging configuration
- broker credentials
- storage credentials

Business configuration should come from the manifest and sink configuration, not from env, where practical.

## Run Identity And Lineage

Recommended v1 rule:

- `crawlRunId = runId`

This keeps lineage aligned with the crawler adaptation and preserves the current crawl-run-based storage and summary model.

## Execution Flow

### 1. Consume detail-captured event

The worker consumes `crawler.detail.captured.v1`.

It must:

- validate the event envelope
- validate the payload
- reject unsupported source types
- resolve the immutable manifest by `runId`

### 2. Resolve idempotency state

The worker should continue using:

- `ingestion_trigger_requests`

This collection remains the item lifecycle record in v1 even though the trigger now arrives via broker instead of HTTP.

Recommended v1 trigger identity:

```text
item:<source>:<searchSpaceId>:<crawlRunId>:<sourceId>
```

The worker must:

- upsert the trigger record
- attempt to claim work for `pending` or retryable failure states
- avoid duplicate processing when the item is already running or completed

### 3. Load artifact content

The worker uses the artifact-store adapter to load the HTML artifact referenced in the event.

Because the current ingestion core expects a local file path, the v1 adapter layer may:

- read directly from a local filesystem path, or
- stage a remote artifact locally before invoking the current core workflow

The current parsing core should remain mostly unchanged.

### 4. Invoke existing single-record ingestion workflow

V1 should wrap the current single-item workflow rather than rewrite it.

Recommended core entrypoint to preserve:

- `runIngestionRecordWorkflow`

The worker adapter should provide:

- `crawlRunId`
- `searchSpaceId`
- `listingRecord`
- local artifact path
- resolved Mongo DB name when Mongo is configured

### 5. Write canonical outputs

V1 output behavior:

- produce one canonical normalized document shape
- write that canonical shape to each configured sink
- do not apply user-selectable output templates in v1

### 6. Persist summaries and trigger state

The worker continues to persist:

- item lifecycle to `ingestion_trigger_requests`
- ingestion run summaries to `ingestion_run_summaries`

V1 compatibility rule:

- preserve the current summary shape as the baseline
- preserve the current collection names
- any additions must be additive only

### 7. Publish ingestion lifecycle events

The worker publishes:

- `ingestion.item.started.v1`
- `ingestion.item.succeeded.v1`
- `ingestion.item.failed.v1`
- `ingestion.item.rejected.v1`

These events are for control-plane observability and do not replace Mongo summary persistence in v1.

## Adaptation Architecture

The ingestion worker should be split conceptually into the following layers.

### Layer 1: Worker event adapter

Owns:

- broker subscription
- envelope validation
- manifest lookup
- lifecycle event publishing

### Layer 2: Trigger-state and idempotency adapter

Owns:

- `ingestion_trigger_requests` updates
- claim/reclaim logic
- duplicate suppression

### Layer 3: Artifact loading adapter

Owns:

- local filesystem reads
- GCS reads
- optional local staging when the current core requires a file path

### Layer 4: Existing ingestion core

Owns:

- detail HTML validation
- cleaner prompt execution
- extractor prompt execution
- canonical normalized document creation
- ingestion summary creation

V1 should reuse as much of the current ingestion core as practical.

### Layer 5: Structured sink adapters

Owns:

- MongoDB canonical-document sink
- local filesystem JSON sink
- GCS JSON sink

## MongoDB Behavior In V1

If MongoDB is configured as a sink, the ingestion worker must preserve the current layout.

Required behavior:

- database name remains `<JOB_COMPASS_DB_PREFIX>-<searchSpaceId>`
- canonical normalized docs go to `normalized_job_ads`
- run summaries go to `ingestion_run_summaries`
- trigger lifecycle goes to `ingestion_trigger_requests`

The ingestion worker should not redesign these collections in v1.

## JSON Sink Behavior In V1

V1 should keep the JSON sink simple and canonical.

Recommended behavior:

- write one canonical JSON document per successful item
- namespace output by run
- use deterministic paths

Recommended logical layout:

```text
runs/<crawlRunId>/
  records/
    normalized-job-<sourceId>.json
```

Only the sink root or prefix changes between local filesystem and GCS.

This keeps JSON sink behavior simple and compatible with event-driven item ingestion.

## Failure Semantics

### Rejected input

If the item is rejected because the artifact is incomplete or terminally invalid:

- mark trigger state as terminal rejection or `completed_with_errors` according to the preserved v1 model
- publish `ingestion.item.rejected.v1`
- preserve observability details in the summary record

### Retryable execution failure

If the item fails due to a retryable execution problem:

- preserve failure details in `ingestion_trigger_requests`
- publish `ingestion.item.failed.v1`
- allow later retry behavior to be introduced without breaking the current storage model

V1 should keep the current workflow behavior as intact as possible and refine retry policy incrementally.

### Partial sink failure

If canonical normalization succeeds but one sink fails:

- do not treat the item as a clean success
- record sink-level results
- emit a non-clean terminal or non-terminal state according to the trigger-state rules

## Batch Reingestion In V1

V1 may preserve the current bulk reingestion path for manual or operator-triggered use.

Recommended behavior:

- retain `runIngestionWorkflow` for batch processing of stored artifact folders
- use the same canonical document shape
- use the same sink adapters where practical

This should be treated as a secondary path in v1.

The primary live path is item-level event-driven ingestion.

## Local Development Model

V1 local execution should support:

- local control plane
- local ingestion worker
- local filesystem artifact reads
- local filesystem JSON sink
- local MongoDB sink
- local broker adapter or real Pub/Sub adapter

## Recommended Implementation Sequence

1. wrap the current single-item workflow behind an event-consumer adapter
2. resolve `RunManifest` by `runId`
3. replace HTTP trigger entry as the primary live path with broker consumption
4. keep `ingestion_trigger_requests` as the idempotency and lifecycle store
5. add JSON sink adapters after Mongo sink compatibility is stable

## Explicit Non-Goals For V1 Worker Work

- output-template selection
- cache-based result reuse
- separate sink-writer worker
- redesign of canonical normalized schema
- redesign of MongoDB topology
