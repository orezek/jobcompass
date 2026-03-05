# Spec Draft: Crawler + Ingestion Control Plane v1

## Status

- draft
- intended as the architecture brief for the next-generation crawler and ingestion platform
- scoped to the imminent implementation target
- does not replace the current app specs yet

## Purpose

Define a redesign where crawler and ingestion are operated from a centralized control plane instead of per-app local files and direct service-to-service triggering.

The redesign should preserve the useful parts of the current system:

- search spaces as the core crawl definition
- immutable run inputs
- artifact-first handoff semantics
- asynchronous ingestion

The redesign should remove the main operational limitations of the current system:

- setup spread across `.env`, checked-in JSON, and local runtime conventions
- direct crawler-to-ingestion HTTP triggering
- limited output destination flexibility
- weak central control over run lifecycle, audit, and operator UX

## Problem Statement

Today:

- `jobs-crawler-actor` is configured by `.env` plus `search-spaces/*.json`
- `jobs-ingestion-service` is configured by `.env`
- the crawler directly triggers ingestion over HTTP
- artifact and output locations are mostly local/runtime conventions
- operator setup is distributed across app-local files

Target state:

- operators configure both systems from one API-backed control surface
- a web GUI sits on top of that API
- crawler and ingestion become worker runtimes
- service-to-service communication is event-driven via pub/sub
- artifacts and outputs are routed to configurable destinations
- runs are driven by immutable manifests created by the control plane

## Goals

- centralize runtime configuration for crawler and ingestion
- provide API control over setup and run lifecycle
- support a GUI for search-space and pipeline management
- support optional ingestion per run
- support artifact-only crawling
- support configurable output sinks for HTML and normalized documents
- decouple crawler and ingestion through brokered events
- preserve idempotent, retry-safe processing boundaries
- support local development and cloud deployment with the same logical model

## Locked Decisions For V1

The following decisions are considered agreed for v1.

- the control plane and GUI will be implemented as a Next.js application
- the initial runtime target is local execution
- the Next.js control plane should remain compatible with later Vercel deployment
- crawler and ingestion workers run locally in v1
- v1 should implement adapter boundaries for Google Cloud Pub/Sub and Google Cloud Storage
- Terraform should provision the Google Cloud infrastructure used by those adapters
- `jobs.cz` is the only source in v1
- a source-adapter abstraction is required in v1 so more sources can be added later
- raw HTML is always required and is always persisted as an artifact
- a pipeline may stop after HTML artifact creation if that is the selected final output
- MongoDB is one possible structured-output sink, not the only system of record
- if MongoDB persistent storage is used in v1, the current per-search-space database layout is preserved
- if MongoDB persistent storage is used in v1, the current collection names are preserved
- the crawler should remain internally compatible with Apify actor execution
- Apify `INPUT.json` should be generated from the control-plane run manifest
- Apify `INPUT.json` is a runtime projection, not the canonical source of truth
- manual and API-triggered runs are in scope for v1
- scheduled runs are deferred to v2

## Non-Goals

- redesign the extraction prompts in this phase
- add multi-source crawling beyond what the source adapter model requires
- replace the current apps immediately with one large rewrite
- deploy workers to Cloud Run in this phase
- implement scheduling and cron orchestration in this phase

## Guiding Principles

- control plane and worker runtimes are separate concerns
- runtime business configuration must not depend on container-local files
- secrets and infrastructure bootstrap may still come from environment variables
- every run must use an immutable config snapshot
- crawler must persist HTML before publishing downstream work
- ingestion must not be required for crawling to succeed
- retries must be safe under at-least-once event delivery
- outputs must be pluggable and independently configurable

## Proposed Platform Shape

### High-level model

The platform is split into five areas:

1. control plane API
2. web GUI
3. crawler worker
4. ingestion worker
5. shared infrastructure for broker, config storage, artifact storage, and observability

### Control plane topology

V1 should use one control plane API, not a separate public control API per worker.

That means:

- the Next.js application owns the operator-facing API
- workers should not expose their own public control APIs for normal operation
- workers consume commands and publish events
- workers may expose health or debug endpoints locally, but those are operational endpoints, not the primary product API

### Logical flow

```text
Web GUI
  -> Control Plane API
  -> Config Store

Control Plane API
  -> validate config
  -> create immutable run manifest
  -> publish run command

Crawler Worker
  -> consume run command
  -> crawl source
  -> persist HTML artifacts
  -> publish crawl and artifact events

Ingestion Worker
  -> consume artifact events
  -> load HTML
  -> extract normalized data
  -> write configured outputs
  -> publish ingestion result events

Observability / Storage
  -> run state
  -> audit trail
  -> artifacts
  -> normalized outputs
```

## Feature Groups

### 1. Control Plane

Owns:

- configuration CRUD
- validation
- run creation
- run lifecycle commands
- immutable run manifest generation
- audit trail
- operator-safe defaults

Primary features:

- create, view, edit, archive, and safely remove search spaces
- create, view, edit, archive, and safely remove output destinations
- create, view, edit, archive, and safely remove pipeline definitions
- create, view, edit, archive, and safely remove runtime profiles
- validate configuration before activation
- start, stop, pause, and resume runs
- prevent duplicate concurrent starts for the same pipeline by default
- version run-relevant config
- track run history and lineage

#### V1 resource-management rule

V1 must provide full operator lifecycle management for reusable configuration records.

Required behavior:

- operators must be able to create, inspect, edit, and remove resources from the GUI and API
- removal must be safe for versioned and historically referenced resources
- hard delete should be allowed only when a resource is unused and has no historical run dependency
- otherwise the system should offer archive or deactivate behavior instead of destructive deletion
- the operator surface must expose these actions directly; they must not require manual file edits

#### V1 run-start safety rule

V1 must not allow accidental duplicate active runs for the same pipeline.

Required behavior:

- only one `queued` or `running` run may exist per pipeline by default
- repeated `Start Run` clicks must not create multiple active runs
- the control-plane API must enforce this server-side
- the GUI must disable or debounce the start action after submit
- if an active run already exists, the API should either return that run or reject the request with a clear conflict response
- starting a new execution after completion should be an explicit follow-up action, not an accidental double-submit side effect

### 2. Search Space Management

Owns the canonical crawl definition.

Primary features:

- GUI-managed search spaces
- API-managed search spaces
- preserve the current search-space model from the existing crawler
- support the current list/search-page oriented configuration
- optional crawl limits and reconciliation policy defaults
- generated worker input derived from stored configuration

### 3. Crawler Runtime

Owns acquisition and crawl-phase observability.

Primary features:

- consume immutable run manifests
- resolve the source adapter
- preserve the current crawler behavior for `jobs.cz` list-page crawling
- persist HTML artifacts
- emit artifact-created events
- emit crawl progress and run summary events
- optionally run in artifact-only mode
- remain independent from ingestion completion

V1 should keep the crawler logic aligned with the current implementation:

- search-space driven list-page crawling
- current reconciliation behavior
- current detail HTML capture behavior
- internal compatibility with Apify actor-style execution

The following expansions are deferred:

- direct detail-URL runs
- mixed list/detail input classification
- alternative list-page behavior when Mongo-backed reconciliation is not available

### Apify compatibility rule

V1 should preserve the ability to run the crawler in an Apify-compatible form.

Required behavior:

- the control plane owns the canonical run configuration
- the control plane creates the immutable `RunManifest`
- an Apify-compatible `INPUT.json` may be generated from that manifest
- the crawler may be executed locally from the manifest or through an Apify-compatible input adapter

The important boundary is:

- `RunManifest` is canonical
- Apify `INPUT.json` is generated runtime input

V1 should not make the Apify input structure the system-wide domain model.

### 4. Ingestion Runtime

Owns normalization and structured output generation.

Primary features:

- subscribe to detail artifact events
- load HTML artifacts from configured storage
- run deterministic parsing and completeness checks
- run LLM cleaning and extraction
- write normalized outputs to one or more sinks
- emit item-level and run-level result events
- distinguish terminal bad input from retryable execution failure

V1 structured-output behavior should stay simple:

- ingestion produces one canonical normalized document shape
- MongoDB and JSON-based sinks receive that canonical shape
- output-template selection is deferred to v2

### 5. Storage and Output Routing

Owns artifacts and normalized output delivery.

Primary features:

- configurable HTML artifact destination
- configurable normalized document destinations
- file output option
- database output option
- object storage option
- support for one or many sinks per pipeline
- retention and naming policy support

#### V1 artifact access rule

Artifacts should be operator-accessible through the control plane, not through manual filesystem browsing.

Required behavior:

- operators must be able to browse run artifacts from the dashboard
- operators must be able to download HTML artifacts from the dashboard in the browser
- raw local filesystem paths are an implementation detail and should not be the primary operator workflow
- the artifact-store backend remains pluggable in v1
- object storage is the preferred production-style backend, but not the only allowed v1 backend

### 6. Eventing and Messaging

Owns service-to-service communication.

Primary features:

- run command events
- crawl lifecycle events
- detail artifact created events
- ingestion result events
- dead-letter strategy
- explicit idempotency keys
- replay-safe consumers

### Broker responsibility boundary

The broker should not write business documents to MongoDB.

In v1:

- the broker transports commands and events
- the ingestion worker processes HTML artifacts
- the ingestion worker writes structured outputs to the configured sinks

So the sequence is:

1. crawler persists HTML
2. crawler publishes artifact event
3. ingestion worker consumes event
4. ingestion worker creates canonical document
5. ingestion worker writes MongoDB and/or JSON outputs
6. ingestion worker publishes result event

The broker is transport, not business persistence.

### Why this is the right v1 boundary

- output templates are worker-owned logic
- sink routing decisions belong to pipeline execution logic
- keeping writes inside ingestion preserves one place for idempotency and output consistency
- the Google Cloud Pub/Sub to MongoDB Dataflow template exists, but it is a separate streaming product path and is not the right default for the v1 application architecture

### 7. Web GUI

Owns operator experience, not worker logic.

Primary features:

- create, inspect, edit, archive, and remove search spaces
- configure whether ingestion is enabled
- create, inspect, edit, archive, and remove artifact and output destinations
- create, inspect, edit, archive, and remove runtime profiles and pipelines
- start and monitor runs
- inspect crawl and ingestion results
- review errors and retry candidates

#### V1 GUI usability requirement

The GUI is not just a proof-of-concept admin page in v1.

Required behavior:

- common operator actions must be discoverable without reading source code or raw JSON files
- edit and remove actions must be present for reusable resources
- destructive actions must use clear confirmation and dependency messaging
- form layout, labels, defaults, and validation feedback must be polished enough for repeated daily use
- run monitoring must surface the most important execution state without forcing operators into the filesystem
- artifact browsing and download must be available from the dashboard for completed or in-progress runs where artifacts exist

## Domain Model

The following first-class domain objects should exist in the control plane.

### SearchSpace

Represents a logical crawl target.

Suggested fields:

- `id`
- `name`
- `description`
- `sourceType`
- `seedUrls`
- `urlMode`
- `crawlDefaults`
- `reconciliationPolicy`
- `status`
- `version`

Notes:

- `seedUrls` may contain list URLs, detail URLs, or mixed URLs if the source adapter supports it
- `urlMode` may be `list_only`, `detail_only`, or `mixed`
- source definitions should describe what to crawl, not worker throttling
- a source-level max-items cap is acceptable in v1
- crawler concurrency and request-rate controls should live in the runtime profile

### RuntimeProfile

Represents execution defaults for workers.

Suggested fields:

- `id`
- `name`
- `crawlerConcurrency`
- `crawlerRateLimit`
- `ingestionConcurrency`
- `timeouts`
- `retryPolicy`
- `debugLogging`

Notes:

- `crawlerConcurrency` is crawler-side parallelism within one run
- `crawlerRateLimit` is a requests-per-minute cap, not parallelism
- `ingestionConcurrency` is ingestion-side parallelism within one run

### OutputDestination

Represents a reusable output target.

Suggested fields:

- `id`
- `name`
- `type`
- `connectionRef`
- `pathTemplate`
- `enabled`
- `retentionPolicy`

Supported destination types in v1:

- `local_filesystem`
- `object_storage`
- `mongodb`
- `json_export`

### PipelineDefinition

Represents how a run should behave.

Suggested fields:

- `id`
- `name`
- `searchSpaceId`
- `runtimeProfileId`
- `artifactDestinationId`
- `normalizedOutputDestinationIds`
- `ingestionMode`
- `runMode`
- `status`
- `version`

Notes:

- `ingestionMode` may be `disabled`, `live_async`, or `manual_only`
- `runMode` may be `crawl_and_ingest`, `crawl_only`, or `reingest_existing_artifacts`

### RunManifest

Represents the immutable runtime snapshot sent to workers.

Suggested fields:

- `runId`
- `pipelineId`
- `pipelineVersion`
- `searchSpaceSnapshot`
- `runtimeSnapshot`
- `artifactDestinationSnapshot`
- `normalizedOutputDestinationSnapshots`
- `ingestionMode`
- `createdAt`
- `createdBy`

### Artifact

Represents a persisted crawler output.

Suggested fields:

- `artifactId`
- `runId`
- `source`
- `sourceId`
- `artifactType`
- `storageType`
- `storagePath`
- `checksum`
- `sizeBytes`
- `createdAt`

### Run

Represents platform-level lifecycle state.

Suggested fields:

- `runId`
- `pipelineId`
- `status`
- `requestedAt`
- `startedAt`
- `finishedAt`
- `stopReason`
- `summary`

## API Surface

This section defines the intended shape, not final OpenAPI.

### Search spaces

- `POST /search-spaces`
- `GET /search-spaces`
- `GET /search-spaces/:id`
- `PATCH /search-spaces/:id`
- `POST /search-spaces/:id/validate`
- `POST /search-spaces/:id/archive`

### Runtime profiles

- `POST /runtime-profiles`
- `GET /runtime-profiles`
- `GET /runtime-profiles/:id`
- `PATCH /runtime-profiles/:id`

### Output destinations

- `POST /output-destinations`
- `GET /output-destinations`
- `GET /output-destinations/:id`
- `PATCH /output-destinations/:id`
- `POST /output-destinations/:id/validate`

### Pipelines

- `POST /pipelines`
- `GET /pipelines`
- `GET /pipelines/:id`
- `PATCH /pipelines/:id`
- `POST /pipelines/:id/validate`
- `POST /pipelines/:id/activate`

### Runs

- `POST /runs`
- `GET /runs`
- `GET /runs/:id`
- `POST /runs/:id/start`
- `POST /runs/:id/stop`
- `POST /runs/:id/pause`
- `POST /runs/:id/resume`
- `POST /runs/:id/retry-failed-items`

V1 run lifecycle guard:

- the control plane must not create more than one active run per pipeline by default
- `queued` and `running` runs count as active
- a new run may be created only after the previous run reaches a terminal state such as `succeeded`, `completed_with_errors`, `failed`, or `stopped`
- any future support for concurrent runs must be an explicit later-version policy, not the default v1 behavior

### Observability

- `GET /runs/:id/events`
- `GET /runs/:id/artifacts`
- `GET /runs/:id/items`
- `GET /runs/:id/failures`

## Event Contracts

Event names are illustrative and should become a versioned contract.

### Run command events

- `crawler.run.requested.v1`
- `crawler.run.stop-requested.v1`
- `crawler.run.pause-requested.v1`
- `crawler.run.resume-requested.v1`

Required payload fields:

- `eventId`
- `eventType`
- `eventVersion`
- `runId`
- `manifest`
- `emittedAt`

### Crawl progress events

- `crawler.run.started.v1`
- `crawler.run.progress.v1`
- `crawler.detail.captured.v1`
- `crawler.run.completed.v1`
- `crawler.run.failed.v1`

`crawler.detail.captured.v1` should include:

- `eventId`
- `runId`
- `source`
- `sourceId`
- `searchSpaceId`
- `artifact`
- `listingRecord`
- `dedupeKey`
- `capturedAt`

### Ingestion events

- `ingestion.item.started.v1`
- `ingestion.item.succeeded.v1`
- `ingestion.item.failed.v1`
- `ingestion.item.rejected.v1`
- `ingestion.run.completed.v1`

Important distinction:

- `failed` means retryable execution failure is possible
- `rejected` means terminal input rejection, for example incomplete or invalid artifact

## Storage Model

### Configuration store

Stores:

- search spaces
- pipeline definitions
- runtime profiles
- output destinations
- run manifests
- run lifecycle state
- audit records

### Artifact store

Stores:

- raw HTML artifacts
- optional dataset-like crawl metadata outputs

Requirements:

- addressable by stable URI/path
- supports checksum validation
- supports environment-specific adapters
- raw HTML artifacts are mandatory in every pipeline mode

### HTML artifact layout compatibility rule for v1

If a pipeline writes HTML artifacts in v1, the logical layout should remain the same as the current system.

Required behavior:

- artifacts are namespaced per run
- the run directory remains under `runs/<crawlRunId>/`
- HTML files remain under `records/`
- HTML filename remains `job-html-<sourceId>.html`
- dataset metadata file remains `dataset.json`
- only the destination root or prefix changes between adapters

Canonical logical layout:

```text
<artifact-root>/
  runs/
    <crawlRunId>/
      dataset.json
      records/
        job-html-<sourceId>.html
```

Examples:

- local filesystem:
  - `<basePath>/runs/<crawlRunId>/records/job-html-<sourceId>.html`
- GCS:
  - `gs://<bucket>/<prefix>/runs/<crawlRunId>/records/job-html-<sourceId>.html`

V1 should treat this as a compatibility requirement, not a redesign area.

### Structured output sinks

Structured outputs should be routed through sink adapters.

v1 sink adapters:

- MongoDB normalized document sink
- JSON file export sink
- object storage JSON sink

### MongoDB compatibility rule for v1

If a pipeline uses MongoDB as persistent storage in v1, the storage layout should remain compatible with the current system.

That means:

- one MongoDB database per search space
- database name derived the same way as today
- existing collection names remain unchanged

Current database naming rule:

- `<JOB_COMPASS_DB_PREFIX>-<searchSpaceId>`

Current collection names to preserve:

- `normalized_job_ads`
- `crawl_run_summaries`
- `ingestion_run_summaries`
- `ingestion_trigger_requests`

Summary compatibility rule:

- crawler summaries should continue to persist to `crawl_run_summaries`
- ingestion summaries should continue to persist to `ingestion_run_summaries`
- v1 should preserve the current summary document shape as the compatibility baseline
- if extra fields are needed in v1, they should be additive rather than breaking

If the control plane needs additional run-state or operator-facing metadata, it should persist that in its own control-plane records rather than rewriting the worker summary model in v1.

V1 should treat this as a compatibility requirement, not as a redesign area.

### Local development model

For local development:

- config store may still be DB-backed
- artifact store may be local filesystem
- output sink may be local filesystem or local MongoDB
- broker may be a real Google Cloud Pub/Sub adapter or a local adapter behind the same interface

## Worker Responsibilities

### Crawler worker responsibilities

- consume run manifests
- classify and crawl input URLs
- reconcile existing state when list crawling is used
- persist artifacts
- publish events
- record crawl summary

### Ingestion worker responsibilities

- consume artifact events
- load artifact content
- validate completeness
- extract structured data
- write outputs
- publish results

### Control plane responsibilities

- never perform crawl or extraction work directly
- validate config
- manage lifecycle
- record state and lineage

## Deployment Model For V1

V1 deployment and execution expectations:

- Next.js GUI and control plane run locally during initial implementation
- crawler worker runs locally
- ingestion worker runs locally
- Google Cloud Pub/Sub and Google Cloud Storage adapters may still be used from those local runtimes
- Terraform should provision the cloud infrastructure required by those adapters

The code should remain deployable later to:

- Vercel for the Next.js application
- managed container runtime for workers

## URL Classification Requirement

The platform must support seed URLs that may represent:

- list/search pages
- detail pages

This requires a source adapter contract.

Each source adapter should provide:

- URL classification
- list-page extraction logic
- detail-page readiness rules
- source-specific normalization hints

In v1, the adapter surface may be implemented only for `jobs.cz`, but the interface should be designed so that new sources do not require control-plane redesign.

## Output Routing Modes

The platform should support these operator-visible modes.

### Mode A: crawl only

- crawler saves HTML artifacts
- ingestion is disabled
- no normalized output is generated

### Mode B: crawl plus live async ingestion

- crawler saves HTML artifacts
- crawler publishes detail-captured events
- ingestion consumes and writes normalized outputs

### Mode C: reingest existing artifacts

- no crawling required
- ingestion reprocesses previously stored artifacts

### Mode D: multi-sink normalized output

- normalized documents go to MongoDB
- normalized JSON is also written to file or object storage

## Failure Model

The redesign must explicitly handle:

- duplicate event delivery
- worker restart during active processing
- broker redelivery
- partial run completion
- artifact persisted but downstream processing unavailable
- normalized output written to one sink but not another

Required design responses:

- explicit idempotency keys
- retry-safe consumers
- durable run and item state
- separation of retryable failure from terminal rejection
- operator visibility into incomplete pipeline state

## Migration Direction

Migration should be phased.

### Phase 1

- introduce control-plane domain model
- keep existing workers largely intact
- move search-space and runtime config into API-backed storage
- generate worker inputs from the control plane

### Phase 2

- replace direct crawler-to-ingestion HTTP trigger with brokered item events
- add artifact and output sink abstractions

### Phase 3

- add web GUI for operator control
- add richer run lifecycle management
- add replay and retry tooling

### Phase 4

- reduce remaining file-based config to bootstrap/secrets only
- generalize the source adapter model

## Open Decisions

The following decisions should be finalized before detailed implementation specs:

- Should output destinations be reusable named resources or inline pipeline config only?
- What minimum audit/history requirements must the control plane keep?
- Do we need a local broker adapter in addition to the Google Cloud Pub/Sub adapter for development and tests?

## Resolved Decision Notes

These were open during the initial brainstorm and are now considered resolved for v1 direction.

### Should config changes version search spaces automatically?

Yes, conceptually.

In v1:

- search spaces should behave as versioned domain objects
- runs must always use an immutable snapshot
- the implementation may use explicit version increments on save or publish

The important requirement is not the exact UI interaction.

The important requirement is:

- a run must be traceable to the exact search-space version it used

### Should output destinations be reusable named resources or inline run config?

Recommended answer: reusable named resources.

Reasoning:

- cleaner GUI model
- easier reuse across pipelines
- easier secret separation
- easier validation
- easier environment promotion

Each run manifest should snapshot the selected destination configuration at run start.

### Should ingestion subscribe directly to crawler events or go through an orchestrator topic?

Recommended answer for v1: direct subscription.

Meaning:

- crawler publishes `detail-captured`
- ingestion subscribes to `detail-captured`

This keeps v1 simpler.

An orchestrated pipeline topic is a v2 concern if we later need:

- fan-out to many downstream processors
- richer routing rules
- central workflow orchestration

## Deferred From V1

The following items are intentionally deferred from the imminent implementation:

- direct detail-URL crawl runs
- mixed list/detail input classification
- list-page pipeline behavior without Mongo-backed reconciliation
- operator-selectable structured-output templates
- production worker deployment topology decisions
- scheduled and cron-driven runs

## Recommended Next Specs

This architecture brief should be followed by:

1. control-plane domain model and API contract spec
2. broker event contract and sink adapter spec
3. crawler worker adaptation spec
4. ingestion worker adaptation spec
5. GUI operator workflow spec
