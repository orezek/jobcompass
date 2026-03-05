# Spec Draft: Control Plane Domain Model and API v1

## Status

- draft
- implementation-facing follow-up to `crawler-ingestion-control-plane-v1.md`

## Purpose

Define the concrete v1 domain objects and operator-facing API for the centralized control plane.

This document is intentionally scoped to the imminent implementation.

## Scope Boundaries

V1 assumptions:

- one source: `jobs.cz`
- one control-plane application: Next.js
- local execution for control plane and workers
- current crawler logic is preserved
- search spaces stay aligned with the current list-page-oriented crawler model
- runs are manual or API-triggered
- raw HTML artifacts are always persisted
- structured output uses one canonical normalized document shape
- MongoDB-backed persistent storage keeps the current per-search-space database topology
- MongoDB-backed persistent storage keeps the current collection names

Deferred from this spec:

- direct detail-URL runs
- mixed list/detail search-space inputs
- scheduled runs
- output-template selection

## Domain Model

### SearchSpace

Represents the canonical crawl definition.

V1 semantics:

- equivalent in intent to the current checked-in search-space JSON files
- list/search-page oriented
- source-specific to `jobs.cz`

Required fields:

- `id`
- `name`
- `description`
- `sourceType`
- `startUrls`
- `maxItemsDefault`
- `allowInactiveMarkingOnPartialRuns`
- `status`
- `version`
- `createdAt`
- `updatedAt`

Field notes:

- `sourceType` is `jobs_cz` in v1
- `startUrls` represent list/search pages in v1
- `maxItemsDefault` is a source-level crawl breadth cap, not a worker concurrency setting
- crawler concurrency and rate limiting do not belong to `SearchSpace` in v1
- `status` is one of:
  - `draft`
  - `active`
  - `archived`

### RuntimeProfile

Represents reusable worker runtime settings.

Required fields:

- `id`
- `name`
- `crawlerMaxConcurrency`
- `crawlerMaxRequestsPerMinute`
- `ingestionConcurrency`
- `ingestionEnabled`
- `debugLog`
- `status`
- `createdAt`
- `updatedAt`

Field notes:

- `crawlerMaxConcurrency` is the maximum number of crawler requests processed in parallel within one run
- `crawlerMaxRequestsPerMinute` is a crawl rate cap, not a parallelism setting
- `ingestionConcurrency` is the maximum number of ingestion items processed in parallel within one run
- runtime profiles own execution throttling in v1
- `status` is one of:
  - `active`
  - `archived`

### ArtifactDestination

Represents where HTML artifacts are written.

Required fields:

- `id`
- `name`
- `type`
- `config`
- `status`
- `createdAt`
- `updatedAt`

Supported `type` values in v1:

- `local_filesystem`
- `gcs`

Artifact destinations define backend storage only.

They do not define the operator access model.

V1 operator rule:

- operators should browse and download artifacts through the dashboard
- raw storage paths are internal references, not the primary user-facing access pattern

`config` examples:

- local filesystem:
  - `basePath`
- gcs:
  - `bucket`
  - `prefix`

#### HTML artifact layout rule

Artifact destinations in v1 change only the storage root or prefix.

They do not change the logical crawler artifact layout.

Required logical layout:

```text
runs/<crawlRunId>/
  dataset.json
  records/
    job-html-<sourceId>.html
```

That means:

- artifacts are grouped per run
- HTML filename remains `job-html-<sourceId>.html`
- the dataset file remains `dataset.json`

Examples:

- local filesystem destination:
  - `<basePath>/runs/<crawlRunId>/records/job-html-<sourceId>.html`
- GCS destination:
  - `gs://<bucket>/<prefix>/runs/<crawlRunId>/records/job-html-<sourceId>.html`

#### Artifact access rule

V1 should expose artifacts through the control plane UI.

Required behavior:

- the dashboard should list available artifacts per run
- the dashboard should allow HTML artifact download in the browser
- filesystem or bucket paths may still exist in internal records, but those paths are implementation details
- direct API-based artifact download can be expanded later, but the dashboard download flow is part of v1

### StructuredOutputDestination

Represents where canonical normalized JSON is written.

Required fields:

- `id`
- `name`
- `type`
- `config`
- `status`
- `createdAt`
- `updatedAt`

Supported `type` values in v1:

- `mongodb`
- `local_json`
- `gcs_json`

`config` examples:

- `mongodb`
  - `connectionRef`
  - `databaseName`
  - `collectionName`
- `local_json`
  - `basePath`
- `gcs_json`
  - `bucket`
  - `prefix`

#### MongoDB compatibility rule

If `type = mongodb`, v1 should preserve the current database layout.

Required behavior:

- one database per search space
- database name derived as `<JOB_COMPASS_DB_PREFIX>-<searchSpaceId>`
- collection names remain unchanged

Required collection names:

- `normalized_job_ads`
- `crawl_run_summaries`
- `ingestion_run_summaries`
- `ingestion_trigger_requests`

Summary compatibility rule:

- `crawl_run_summaries` remains the crawler summary collection
- `ingestion_run_summaries` remains the ingestion summary collection
- the current summary document shape is preserved as the v1 baseline
- any new fields added in v1 should be additive only

The control plane may select whether MongoDB is used.

If MongoDB is used, it should not redesign the schema topology in v1.

### Pipeline

Represents an operator-managed runnable configuration.

Required fields:

- `id`
- `name`
- `searchSpaceId`
- `runtimeProfileId`
- `artifactDestinationId`
- `structuredOutputDestinationIds`
- `mode`
- `status`
- `version`
- `createdAt`
- `updatedAt`

`mode` values in v1:

- `crawl_only`
- `crawl_and_ingest`

`status` values:

- `draft`
- `active`
- `archived`

V1 notes:

- `crawl_only` still persists HTML artifacts
- `crawl_and_ingest` persists HTML and publishes events for ingestion
- `structuredOutputDestinationIds` may be empty only when `mode = crawl_only`

### RunManifest

Represents the immutable runtime snapshot published to workers.

Required fields:

- `runId`
- `pipelineId`
- `pipelineVersion`
- `searchSpaceSnapshot`
- `runtimeProfileSnapshot`
- `artifactDestinationSnapshot`
- `structuredOutputDestinationSnapshots`
- `mode`
- `sourceType`
- `createdAt`
- `createdBy`

Run manifests must be immutable after creation.

#### Apify projection rule

V1 should support generating an Apify-compatible crawler input from the immutable `RunManifest`.

That means:

- `RunManifest` is the canonical control-plane object
- Apify `INPUT.json` is a derived runtime projection
- the generated `INPUT.json` should preserve compatibility with the current crawler's actor-style execution model

The control plane may optionally persist the generated projection for debugging or execution handoff.

### Run

Represents control-plane run lifecycle state.

Required fields:

- `runId`
- `pipelineId`
- `pipelineVersion`
- `status`
- `requestedAt`
- `startedAt`
- `finishedAt`
- `stopReason`
- `summary`

`status` values in v1:

- `queued`
- `running`
- `succeeded`
- `completed_with_errors`
- `failed`
- `stopped`

#### Active-run exclusivity rule

V1 should treat `queued` and `running` runs as active.

Required behavior:

- only one active `Run` may exist per `Pipeline` by default
- repeated start requests for a pipeline with an active run must not create a second active run
- a new run may be created only after the previous run reaches a terminal state
- terminal states in v1 are:
  - `succeeded`
  - `completed_with_errors`
  - `failed`
  - `stopped`

### RunItem

Represents item-level tracking for artifact and ingestion processing.

Required fields:

- `runItemId`
- `runId`
- `source`
- `sourceId`
- `artifactStatus`
- `ingestionStatus`
- `artifactRef`
- `error`
- `createdAt`
- `updatedAt`

`artifactStatus` values:

- `not_started`
- `stored`
- `failed`

`ingestionStatus` values:

- `not_requested`
- `queued`
- `running`
- `succeeded`
- `completed_with_errors`
- `failed`
- `rejected`

## Domain Relationships

- one `SearchSpace` can be used by many `Pipeline` records
- one `RuntimeProfile` can be used by many `Pipeline` records
- one `ArtifactDestination` can be used by many `Pipeline` records
- one `Pipeline` may reference zero or many `StructuredOutputDestination` records
- one `Pipeline` produces many `Run` records
- one `Run` owns one immutable `RunManifest`
- one `Run` may produce many `RunItem` records

## Resource Lifecycle Rules

V1 must support full operator lifecycle management for reusable resources.

Required behavior:

- resources must be creatable, viewable, editable, and removable from the control plane
- destructive deletion must be safe
- if a resource is referenced by historical runs, active pipelines, or other persisted records, the default action should be archive or deactivate rather than hard delete
- hard delete should be allowed only when the resource is unused and has no historical dependency that would break run lineage or operator history
- the GUI and API should make the difference between archive and delete explicit

## Validation Rules

### SearchSpace validation

V1 rules:

- `sourceType` must be `jobs_cz`
- `startUrls` must be non-empty
- each `startUrl` must be a valid URL
- search-space IDs must be unique
- source definitions must not define crawler concurrency or request-rate settings in v1

### Pipeline validation

V1 rules:

- `searchSpaceId` must reference an active search space
- `runtimeProfileId` must reference an active runtime profile
- `artifactDestinationId` must reference an active artifact destination
- `crawl_only` pipelines must not require structured output destinations
- `crawl_and_ingest` pipelines must reference at least one structured output destination

### Run-start validation

V1 rules:

- a new run request must reference an active pipeline
- a pipeline with an active `queued` or `running` run must not receive a second active run by default
- duplicate submits from the UI must be handled safely even if the browser sends multiple requests

## Operator-Facing API

This section defines the intended v1 API shape.

### Search spaces

#### `POST /api/search-spaces`

Create a search space.

Request body:

```json
{
  "id": "prague-tech-jobs",
  "name": "Prague Tech Jobs",
  "description": "Main Prague tech search space on jobs.cz",
  "sourceType": "jobs_cz",
  "startUrls": ["https://www.jobs.cz/prace/praha/?q=developer"],
  "maxItemsDefault": 100,
  "allowInactiveMarkingOnPartialRuns": false
}
```

#### `GET /api/search-spaces`

List search spaces.

#### `GET /api/search-spaces/:id`

Get one search space.

#### `PATCH /api/search-spaces/:id`

Update a search space and create a new versioned state.

#### `POST /api/search-spaces/:id/validate`

Validate search-space configuration without starting a run.

#### `POST /api/search-spaces/:id/archive`

Archive a search space.

#### `DELETE /api/search-spaces/:id`

Delete a search space if it is unused and safe to remove.

If the search space is historically referenced, the API should reject hard delete and require archive instead.

### Runtime profiles

#### `POST /api/runtime-profiles`

Create a runtime profile.

#### `GET /api/runtime-profiles`

List runtime profiles.

#### `GET /api/runtime-profiles/:id`

Get one runtime profile.

#### `PATCH /api/runtime-profiles/:id`

Update a runtime profile.

#### `POST /api/runtime-profiles/:id/archive`

Archive a runtime profile.

#### `DELETE /api/runtime-profiles/:id`

Delete a runtime profile if it is unused and safe to remove.

### Artifact destinations

#### `POST /api/artifact-destinations`

Create an artifact destination.

#### `GET /api/artifact-destinations`

List artifact destinations.

#### `GET /api/artifact-destinations/:id`

Get one artifact destination.

#### `PATCH /api/artifact-destinations/:id`

Update an artifact destination.

#### `POST /api/artifact-destinations/:id/archive`

Archive an artifact destination.

#### `POST /api/artifact-destinations/:id/validate`

Validate artifact destination connectivity and write capability.

#### `DELETE /api/artifact-destinations/:id`

Delete an artifact destination if it is unused and safe to remove.

### Structured output destinations

#### `POST /api/structured-output-destinations`

Create a structured output destination.

#### `GET /api/structured-output-destinations`

List structured output destinations.

#### `GET /api/structured-output-destinations/:id`

Get one structured output destination.

#### `PATCH /api/structured-output-destinations/:id`

Update a structured output destination.

#### `POST /api/structured-output-destinations/:id/archive`

Archive a structured output destination.

#### `POST /api/structured-output-destinations/:id/validate`

Validate structured output destination connectivity and write capability.

#### `DELETE /api/structured-output-destinations/:id`

Delete a structured output destination if it is unused and safe to remove.

### Pipelines

#### `POST /api/pipelines`

Create a pipeline.

Request body:

```json
{
  "name": "Prague Jobs Crawl And Ingest",
  "searchSpaceId": "prague-tech-jobs",
  "runtimeProfileId": "default-local-runtime",
  "artifactDestinationId": "local-html-artifacts",
  "structuredOutputDestinationIds": ["local-json-output", "mongo-primary"],
  "mode": "crawl_and_ingest"
}
```

#### `GET /api/pipelines`

List pipelines.

#### `GET /api/pipelines/:id`

Get one pipeline.

#### `PATCH /api/pipelines/:id`

Update a pipeline and create a new versioned state.

#### `POST /api/pipelines/:id/validate`

Validate pipeline wiring before activation.

#### `POST /api/pipelines/:id/activate`

Mark a pipeline active and available for runs.

#### `POST /api/pipelines/:id/archive`

Archive a pipeline.

#### `DELETE /api/pipelines/:id`

Delete a pipeline if it is unused and safe to remove.

### Runs

#### `POST /api/runs`

Create a run request from a pipeline.

V1 behavior:

- if the pipeline has no active run, create a new run
- if the pipeline already has an active `queued` or `running` run, do not create another active run
- the API should either:
  - return the existing active run, or
  - reject with a clear conflict response such as `409 Conflict`

The key requirement is that repeated clicks or retries must not create duplicate active runs.

Request body:

```json
{
  "pipelineId": "pipeline_prague_jobs_main"
}
```

Response shape:

```json
{
  "runId": "run_01",
  "pipelineId": "pipeline_prague_jobs_main",
  "status": "queued"
}
```

#### `POST /api/runs/:id/start`

Create the immutable manifest and publish the run command.

V1 behavior:

- this operation must be idempotent for a given run
- publishing the run command more than once for the same run should not create duplicate crawler executions

#### `POST /api/runs/:id/stop`

Request that the run stop.

#### `GET /api/runs`

List runs.

#### `GET /api/runs/:id`

Get one run with summary state.

#### `GET /api/runs/:id/items`

List item-level run state.

#### `GET /api/runs/:id/events`

List control-plane-visible events for the run.

## API Design Rules

- all operator writes go through the control plane API
- workers do not own the public product API
- a run is created from an active pipeline
- a run manifest is immutable once published
- responses should expose version and status fields explicitly
- duplicate `Start Run` submissions must be safe by default
- the server, not only the UI, must enforce active-run exclusivity per pipeline in v1
- edit and remove actions for reusable settings must be available in both the API and GUI in v1
- delete operations must enforce safe-removal rules rather than breaking historical run lineage

## Versioning Rules

- `SearchSpace` and `Pipeline` are versioned domain objects
- `RunManifest` snapshots exact versions used at run start
- updates do not mutate the meaning of already-started runs

## Recommended Follow-Up Specs

This spec should be paired with:

1. `docs/specs/pipeline-events-sinks-v1.md`
2. crawler worker adaptation spec
3. ingestion worker adaptation spec
