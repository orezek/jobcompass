# crawler-worker-v2

Standalone crawler execution worker for V2.

It accepts one `StartRun` command over REST, performs:

1. phase 1 list collection and reconciliation against `normalized_job_ads`
2. phase 2 detail HTML capture for new listings only

It persists:

- `crawl_run_summaries`

It updates:

- existing `normalized_job_ads` documents during reconciliation only

It emits:

- `crawler.run.started`
- `crawler.detail.captured`
- `crawler.run.finished`

## HTTP surface

- `GET /healthz`
- `GET /readyz`
- `POST /v1/runs`
- `POST /v1/runs/:runId/cancel`

## Bootstrap env

The worker bootstrap env is intentionally minimal. See [`.env.example`](./.env.example).

Required at runtime:

- `GCP_PROJECT_ID`
- `PUBSUB_EVENTS_TOPIC`
- `MONGODB_URI`
- control auth env matching `CONTROL_AUTH_MODE`

Artifact storage is not configured in bootstrap env. It is provided per run through the V2
`artifactSink`.

## StartRun shape

The worker accepts the shared V2 crawler contract from `@repo/control-plane-contracts`:

- `runId`
- `idempotencyKey`
- `runtimeSnapshot`
- `inputRef`
- `persistenceTargets.dbName`
- `artifactSink`

The request does not include:

- `workerType`
- `requestedAt`
- `correlationId`

## Local development

Install dependencies from repo root:

```bash
pnpm install
```

Run the worker:

```bash
pnpm -C apps/crawler-worker-v2 dev
```

## Validation

```bash
pnpm -C apps/crawler-worker-v2 lint
pnpm -C apps/crawler-worker-v2 check-types
pnpm -C apps/crawler-worker-v2 build
```

## E2E test

The app includes a deterministic E2E test that:

- serves a local fixture site over HTTP
- runs the crawler worker runtime against that site
- uses real MongoDB
- uses a fake in-memory Pub/Sub topic only for event capture
- verifies reconciliation, artifact writes, summary persistence, and V2 event emission

Run it with a MongoDB URI available in the shell:

```bash
export CRAWLER_WORKER_V2_E2E_MONGODB_URI='mongodb+srv://...'
pnpm -C apps/crawler-worker-v2 test:e2e
```
