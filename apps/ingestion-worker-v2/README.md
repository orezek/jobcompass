# ingestion-worker-v2

Lightweight ingestion worker for V2 architecture.

- minimal bootstrap from `.env`
- Fastify REST API for run lifecycle
- Pub/Sub event consumption (`crawler.detail.captured`, `crawler.run.finished`)
- MongoDB persistence (`ingestion_run_summaries`, `normalized_jobs`)
- run-scoped downloadable JSON output delivery (`gcs` or `local_filesystem`)
- V1-compatible normalized job model (`listing`, `detail`, `rawDetailPage`, `ingestion`)

## Bootstrap `.env`

```bash
CONTROL_SHARED_TOKEN=replace-me
GCP_PROJECT_ID=your-gcp-project
PUBSUB_EVENTS_TOPIC=run-events
INGESTION_PARSER_BACKEND=fixture
```

Production parser backend (Gemini):

```bash
INGESTION_PARSER_BACKEND=gemini
GEMINI_API_KEY=replace-me
LANGSMITH_API_KEY=replace-me
```

Optional overrides:

```bash
PORT=3020
SERVICE_NAME=ingestion-worker
SERVICE_VERSION=2.0.0
CONTROL_AUTH_MODE=token
CONTROL_JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----...
PUBSUB_EVENTS_SUBSCRIPTION=ingestion-worker-events-subscription
LOG_LEVEL=info
LOG_PRETTY=false
MAX_CONCURRENT_RUNS=4
PUBSUB_AUTO_CREATE_SUBSCRIPTION=true
ENABLE_PUBSUB_CONSUMER=true
MONGODB_SINK_MAX_POOL_SIZE=10
MONGODB_SINK_MAX_CONNECTING=2
MONGODB_SINK_WAIT_QUEUE_TIMEOUT_MS=10000
MONGODB_SINK_IDLE_TTL_MS=30000
MONGODB_SINK_MAX_ACTIVE_CLIENTS=8
LLM_EXTRACTOR_PROMPT_NAME=jobcompass-job-ad-structured-extractor
LLM_CLEANER_PROMPT_NAME=jobcompass-job-ad-text-cleaner
GEMINI_MODEL=gemini-3-flash-preview
GEMINI_TEMPERATURE=0
GEMINI_THINKING_LEVEL=LOW
GEMINI_INPUT_PRICE_USD_PER_1M_TOKENS=0.5
GEMINI_OUTPUT_PRICE_USD_PER_1M_TOKENS=3
DETAIL_PAGE_MIN_RELEVANT_TEXT_CHARS=700
LOG_TEXT_TRANSFORM_CONTENT=false
LOG_TEXT_TRANSFORM_PREVIEW_CHARS=1200
PARSER_VERSION=ingestion-worker-v2-v1-model
```

When `ENABLE_PUBSUB_CONSUMER=true` and `PUBSUB_AUTO_CREATE_SUBSCRIPTION=true`, startup
auto-creates Pub/Sub topic/subscription if they do not exist.

## Database and output routing policy

Mongo sink routing is run-scoped and provided through `StartRun.persistenceTargets`:

- `persistenceTargets.mongodbUri`
- `persistenceTargets.dbName`

Output routing is ingestion-only and optional:

- MongoDB writes to canonical `normalized_jobs` are always on
- `outputSinks` enables downloadable JSON writes
- downloadable JSON routing is run-scoped from `outputSinks[].delivery`

Worker bootstrap env does not own Mongo target URI/dbName or output bucket/basePath.

## Endpoints

- `GET /healthz`
- `GET /readyz`
- `POST /v1/runs`
- `POST /v1/runs/:runId/cancel`
- `GET /v1/runs/:runId/outputs`

`POST /v1/runs` payload includes:

- `runId`
- `idempotencyKey`
- `runtimeSnapshot.ingestionConcurrency` (optional)
- `inputRef.crawlRunId`
- `inputRef.searchSpaceId`
- `persistenceTargets.mongodbUri`
- `persistenceTargets.dbName`
- optional `outputSinks` with per-sink `delivery`

`POST /v1/runs/:runId/cancel` payload:

- `reason: "startup_rollback" | "operator_request"`
- optional `details` by reason

## Execution model

- `POST /v1/runs` creates an event-driven run registration.
- Pub/Sub consumer attaches after first accepted `StartRun`.
- Run finalizes only after `crawler.run.finished` and queue/active drain.
- ACK/NACK policy:
  - ACK after successful processing and persistence.
  - NACK for transient processing failures for redelivery.
  - ACK for permanent failures after recording failure state.
- If no detail events are received within idle timeout (default 60s), run auto-expires as `stopped`.

Event compatibility:

- canonical runtime broker event shape is V2 (`eventVersion: "v2"`)
- legacy V1 crawler event shape is still accepted during transition

## Local run

```bash
pnpm -C apps/ingestion-worker-v2 dev
```

## Run E2E tests (MongoDB Atlas/shared DB)

Set these variables before running:

```bash
export INGESTION_WORKER_V2_E2E_MONGODB_URI='mongodb+srv://...'
export INGESTION_WORKER_V2_E2E_DB_NAME='ingestion_worker_v2_shared_e2e'
export INGESTION_WORKER_V2_E2E_INGESTION_RUN_SUMMARIES_COLLECTION='ingestion_run_summaries'
export INGESTION_WORKER_V2_E2E_NORMALIZED_JOB_ADS_COLLECTION='normalized_jobs'
export INGESTION_WORKER_V2_E2E_KEEP_ARTIFACTS='true'
export INGESTION_WORKER_V2_E2E_PARSER_BACKEND='gemini'
export INGESTION_WORKER_V2_E2E_GEMINI_API_KEY='...'
export INGESTION_WORKER_V2_E2E_LANGSMITH_API_KEY='...'
export INGESTION_WORKER_V2_E2E_GEMINI_MODEL='gemini-3-flash-preview'
export INGESTION_WORKER_V2_E2E_PARSER_VERSION='ingestion-worker-v2-v1-model-test'
export INGESTION_WORKER_V2_E2E_RUN_TIMEOUT_MS='180000'
export INGESTION_WORKER_V2_E2E_DOC_TIMEOUT_MS='180000'
export INGESTION_WORKER_V2_E2E_EVENT_TIMEOUT_MS='30000'
```

Run:

```bash
pnpm -C apps/ingestion-worker-v2 test:e2e
```
