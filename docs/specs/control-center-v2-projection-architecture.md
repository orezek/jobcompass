# Spec Draft: Control Center v2 Control-Service Projection Architecture

## Status

- draft
- recommended V2 MVP backend architecture
- intended companion to:
  - `docs/specs/control-plane-v2-pipeline-first.md`
  - `docs/specs/crawler-ingestion-control-plane-v2.md`

## Purpose

Define how `control-center-v2` talks to one backend service that owns command orchestration, runtime
event ingestion, MongoDB projections, and live read APIs.

This document exists to make one V2 runtime boundary explicit:

- the UI sends commands to `control-service`
- the UI reads live data from `control-service`
- workers emit Pub/Sub runtime events
- `control-service` persists and projects those events into MongoDB
- the UI never reads Pub/Sub, worker APIs, or pipeline-owned databases directly

## Problem To Solve

V2 moves crawler and ingestion into standalone services. That creates two runtime problems:

1. `control-center-v2` is expected to run as a stateless web app, for example on Vercel.
2. each pipeline owns its own production database.

Known constraints:

- Pub/Sub subscriptions require a long-lived consumer and are not a good fit for Vercel request
  handlers
- pipeline-owned telemetry lives in many pipeline databases
- pipeline-local collections like `crawl_run_summaries` and `ingestion_run_summaries` are useful
  deep telemetry, but they are not a good primary source for one cross-pipeline operator UI
- the operator experience still needs one logical surface for:
  - pipeline management
  - run start/stop/cancel
  - run status and history
  - artifact and output browsing

Without one backend control boundary, the UI would be forced to:

- talk to workers directly
- read Pub/Sub directly
- read many pipeline databases directly
- or rebuild filesystem/archive coupling

That is the wrong direction for V2.

## Core Decision

V2 should use one dedicated backend control service.

Canonical rule:

- `control-center-v2` is the operator UI only
- `control-service` owns commands, orchestration, projection, and live read APIs
- workers stay dumb and only execute work plus emit events
- the UI reads control-plane MongoDB projections through `control-service` only

This keeps the UI simple while preserving the event-driven worker model.

## Design Principles

1. The UI talks only to `control-service`.
2. The UI never talks directly to workers, Pub/Sub, or pipeline-owned databases.
3. Workers never write cross-pipeline control-plane read models directly.
4. Control-plane read models live in one control-plane database.
5. Projection writes must be idempotent.
6. Pipeline-owned telemetry stays in pipeline-owned databases.
7. Artifact and output browsing should be derived from events plus deterministic storage rules
   unless a dedicated index is proven necessary later.
8. Keep the MVP model small and add fields only when a real UI needs them.

## Service Ownership

### `control-center-v2`

Responsibilities:

- operator-facing UI
- pipeline create/update/delete forms
- run start/stop/cancel interactions
- rendering dashboards, lists, detail pages, and live run views

Not responsible for:

- direct worker orchestration
- consuming Pub/Sub subscriptions
- writing MongoDB projections directly
- reading worker APIs or pipeline databases directly

### `control-service`

Responsibilities:

- expose the API used by `control-center-v2`
- own pipeline-centric CRUD and run command handling
- write initial run-ledger state:
  - `control_plane_runs`
  - `control_plane_run_manifests`
- send worker `StartRun` and stop/cancel commands
- subscribe to the runtime Pub/Sub topic
- validate runtime events against `@repo/control-plane-contracts`
- persist event history into `control_plane_run_event_index`
- reduce runtime events into `control_plane_runs`
- expose read APIs backed by control-plane MongoDB
- expose live update streams to the UI via SSE or WebSocket

Not responsible for:

- doing crawl work
- doing ingestion work
- storing large blob payloads directly in MongoDB

### `crawler-worker-v2`

Responsibilities:

- accept `POST /v1/runs`
- execute crawl workload
- write crawler artifacts and crawler telemetry to the pipeline-owned database/storage
- emit runtime events

### `ingestion-worker-v2`

Responsibilities:

- accept `POST /v1/runs`
- consume crawler runtime events needed for handoff/finalization
- execute normalization/output routing workload
- write ingestion telemetry and production output payloads to the pipeline-owned database/storage
- emit runtime events

## Recommended V2 MVP Deployment

- `control-center-v2`: Vercel or another stateless web runtime
- `control-service`: Cloud Run or another long-lived container runtime
- crawler worker: Cloud Run or another container runtime
- ingestion worker: Cloud Run or another container runtime
- MongoDB Atlas: authoritative DB for control-plane state and pipeline-owned data
- GCP Pub/Sub: runtime event transport
- GCP Cloud Storage: artifact and downloadable output blob storage

## Control-Plane Collections

The control-plane database should contain these collections:

- `control_plane_pipelines`
- `control_plane_runs`
- `control_plane_run_manifests`
- `control_plane_run_event_index`
- `control_plane_bootstrap_profiles`

For V2 MVP, these are enough.

Not introduced in MVP:

- `control_plane_artifact_index`
- `control_plane_output_index`

Reason:

- artifact listing can be derived from `crawler.detail.captured`
- downloadable JSON listing can be derived from `ingestion.item.succeeded` plus the run manifest
  and deterministic storage-path rules

If those reads later become too expensive or awkward, dedicated index collections can be added as
derived projections without changing worker contracts.

## Why `control_plane_runs` Must Exist

Each pipeline owns a separate production database.

That means pipeline-owned collections like:

- `crawl_run_summaries`
- `ingestion_run_summaries`
- `normalized_job_ads`

are not a good primary source for a cross-pipeline dashboard.

`control_plane_runs` exists to solve that:

- one document per run
- one control-plane database
- enough denormalized fields to render run lists, run status, and overview dashboards without
  scanning many pipeline databases

The authoritative deep telemetry remains in pipeline-owned summary collections. The control-plane
run projection stores only the subset needed by the UI.

## Projection Collection Roles

### `control_plane_run_manifests`

Authoritative command snapshot written when a run is created.

Purpose:

- replay
- audit
- artifact/output path resolution
- preserving the pipeline-owned execution snapshot

### `control_plane_run_event_index`

Append-style event history, one document per runtime event.

Purpose:

- event history UI
- artifact listing derivation
- downloadable JSON listing derivation
- debugging and audit

### `control_plane_runs`

One current-state projection document per run.

Purpose:

- run list UI
- run detail header/status
- overview dashboards
- current phase status without replaying the full event stream on every request

## Recommended Document Shapes

### `control_plane_run_event_index`

Recommended shape:

```json
{
  "_id": "evt-123",
  "eventId": "evt-123",
  "runId": "crawl-run-test-vyvoj-002",
  "eventType": "crawler.detail.captured",
  "eventVersion": "v2",
  "producer": "crawler-worker",
  "occurredAt": "2026-03-07T07:30:10.000Z",
  "correlationId": "jobs.cz:test-vyvoj:crawl-run-test-vyvoj-002:2001063102",
  "crawlRunId": "crawl-run-test-vyvoj-002",
  "searchSpaceId": "test-vyvoj",
  "source": "jobs.cz",
  "sourceId": "2001063102",
  "dedupeKey": "jobs.cz:test-vyvoj:crawl-run-test-vyvoj-002:2001063102",
  "payload": {},
  "projectionStatus": "applied",
  "ingestedAt": "2026-03-07T07:30:10.300Z"
}
```

Important indexes:

- unique `{ eventId: 1 }`
- `{ runId: 1, occurredAt: 1 }`
- `{ eventType: 1, occurredAt: -1 }`
- `{ crawlRunId: 1, occurredAt: 1 }`
- optional `{ sourceId: 1 }` for artifact/output drill-down

### `control_plane_runs`

Recommended shape:

```json
{
  "_id": "crawl-run-test-vyvoj-002",
  "runId": "crawl-run-test-vyvoj-002",
  "pipelineId": "test-vyvoj",
  "pipelineName": "test-vyvoj",
  "mode": "crawl_and_ingest",
  "dbName": "test-vyvoj",
  "source": "jobs.cz",
  "searchSpaceId": "test-vyvoj",
  "status": "running",
  "requestedAt": "2026-03-07T07:29:59.000Z",
  "startedAt": "2026-03-07T07:30:01.000Z",
  "finishedAt": null,
  "lastEventAt": "2026-03-07T07:30:10.000Z",
  "stopReason": null,
  "crawler": {
    "status": "running",
    "startedAt": "2026-03-07T07:30:01.000Z",
    "finishedAt": null,
    "detailPagesCaptured": 1
  },
  "ingestion": {
    "enabled": true,
    "status": "running",
    "startedAt": "2026-03-07T07:29:59.500Z",
    "finishedAt": null,
    "jobsProcessed": 0,
    "jobsFailed": 0,
    "jobsSkippedIncomplete": 0
  },
  "artifacts": {
    "detailCapturedCount": 1
  },
  "outputs": {
    "downloadableJsonEnabled": true,
    "downloadableJsonCount": 0
  },
  "summary": {
    "newJobsCount": null,
    "existingJobsCount": null,
    "inactiveMarkedCount": null,
    "failedRequests": null,
    "totalTokens": null,
    "totalEstimatedCostUsd": null
  }
}
```

Important indexes:

- unique `{ runId: 1 }`
- `{ pipelineId: 1, requestedAt: -1 }`
- `{ status: 1, requestedAt: -1 }`
- `{ source: 1, requestedAt: -1 }`

## Event Derivation Rules

`control-service` should not invent runtime facts. It should reduce what the workers emit.

### Events That Must Be Indexed

- `crawler.run.started`
- `crawler.detail.captured`
- `crawler.run.finished`
- `ingestion.run.started`
- `ingestion.item.started`
- `ingestion.item.succeeded`
- `ingestion.item.failed`
- `ingestion.item.rejected`
- `ingestion.run.finished`

### `control_plane_runs` Reducer Rules

#### Initial Run Creation

Written synchronously by `control-service` when the operator starts a run.

Purpose:

- the UI can show the run immediately
- runtime events always have a run record to land against

Initial state:

- `status = queued`
- `crawler.status = queued`
- `ingestion.status = queued` only if ingestion is enabled

#### `crawler.run.started`

- set `status = running`
- set `crawler.status = running`
- set `startedAt` if empty
- update `lastEventAt`

#### `crawler.detail.captured`

- increment `crawler.detailPagesCaptured`
- increment `artifacts.detailCapturedCount`
- update `lastEventAt`

Artifact listing for the UI should be derived by querying
`control_plane_run_event_index` for this event type.

#### `crawler.run.finished`

- set `crawler.status` to the terminal crawler status
- set `crawler.finishedAt`
- copy minimal terminal fields:
  - `stopReason`
  - `source`
  - `searchSpaceId`
- update `lastEventAt`

If the run is `crawl_only`, this event can finalize the overall run.

If ingestion is enabled, overall finalization waits for `ingestion.run.finished`.

#### `ingestion.run.started`

- set `status = running`
- set `ingestion.status = running`
- set `ingestion.startedAt`
- update `lastEventAt`

#### `ingestion.item.started`

- update `lastEventAt`

#### `ingestion.item.succeeded`

- increment `ingestion.jobsProcessed`
- increment `outputs.downloadableJsonCount` only if the run manifest enables downloadable JSON
- update `lastEventAt`

Downloadable JSON listing for the UI should be derived from:

- `ingestion.item.succeeded` events in `control_plane_run_event_index`
- `control_plane_run_manifests`
- deterministic storage-path rules

#### `ingestion.item.failed`

- increment `ingestion.jobsFailed`
- update `lastEventAt`

#### `ingestion.item.rejected`

- increment `ingestion.jobsSkippedIncomplete`
- update `lastEventAt`

#### `ingestion.run.finished`

- set `ingestion.status` to the terminal status
- set `ingestion.finishedAt`
- set overall `status` to the ingestion terminal status
- set `finishedAt`
- copy summary excerpt fields needed by the UI:
  - `totalTokens`
  - `totalEstimatedCostUsd`
  - `jobsProcessed`
  - `jobsFailed`
  - `jobsSkippedIncomplete`
- update `lastEventAt`

## Projection Algorithm

Recommended handling for each Pub/Sub message:

1. parse and validate the event
2. begin MongoDB transaction
3. check whether `eventId` already exists in `control_plane_run_event_index`
4. if it already exists:
   - commit no-op
   - ack message
5. if it does not exist:
   - insert event document
   - load `control_plane_runs` projection
   - apply reducer
   - upsert the new projection document
   - commit
6. ack the message only after commit

Reason:

- duplicates are harmless
- event index and run projection stay consistent
- retries remain safe

MongoDB Atlas supports transactions, so this should be the canonical V2 approach.

## Unknown-Run Event Handling

V2 contract intent is:

- `control-service` creates the run record before workers emit events

So unknown-run events should be treated as anomalies.

Recommended behavior:

- write the event into `control_plane_run_event_index` with `projectionStatus = orphaned`
- do not create a synthetic `control_plane_runs` document
- ack the message
- surface the anomaly in logs and alerts

This preserves the event without corrupting the run projection model.

## UI Read Model And Live Updates

The UI should not access MongoDB directly.

Normal read path:

- UI query -> `control-service` -> control-plane MongoDB

Normal write path:

- operator action -> `control-center-v2` -> `control-service` command API -> worker REST `StartRun`

Normal runtime path:

- worker event -> Pub/Sub -> `control-service` subscriber -> control-plane MongoDB

Recommended live-update approach for MVP:

- use SSE from `control-service`

Optional later upgrade:

- use WebSocket only if the operator UI needs richer bidirectional session behavior

The key rule does not change:

- the UI reads projected control-plane data only

## Why No Dedicated Artifact/Output Index In MVP

### Artifacts

`crawler.detail.captured` already carries:

- `sourceId`
- `dedupeKey`
- listing snapshot
- artifact storage reference

That is enough to build artifact browser views.

### Downloadable JSON Outputs

`ingestion.item.succeeded` plus the run manifest is enough because:

- the run manifest knows which downloadable destinations are enabled
- the output storage path is deterministic from `runId`, destination, and `sourceId`

That is enough to build output browser views without another collection.

## Tradeoff

This MVP keeps the number of control-plane collections low.

If later query patterns prove too expensive, add:

- `control_plane_artifact_index`
- `control_plane_output_index`

as derived projections only.

Do not add them before the actual read patterns justify them.

## V2 MVP Recommendation

Build V2 with these moving parts:

1. `control-center-v2`
2. `control-service`
3. `crawler-worker-v2`
4. `ingestion-worker-v2`

And these control-plane MongoDB collections:

1. `control_plane_pipelines`
2. `control_plane_runs`
3. `control_plane_run_manifests`
4. `control_plane_run_event_index`
5. `control_plane_bootstrap_profiles`

That is the simplest architecture that:

- works with Vercel
- preserves event-driven runtime behavior
- avoids polling workers
- avoids filesystem coupling
- gives the UI one authoritative backend and one authoritative control-plane database to read

## Non-Goals

Not part of this spec:

- scheduler service design
- control-center authentication
- artifact/output retention policy
- historical backfill from V1 archived broker files
- replacing pipeline-owned telemetry summaries as the deep telemetry authority
