# v2.1 Delivered Scope and v3 Deferred Scope

Status: Draft  
Owner: Platform  
Date: 2026-03-09

## 1) Purpose

This document summarizes what is already delivered in v2.1 and what remains deferred for v3 planning.
It is a planning snapshot based on:

1. `docs/specs/gcp-infrastructure-alignment-v3.md`
2. `CHANGELOG.md` (Unreleased)
3. Implemented code paths in `control-service-v2`, `crawler-worker-v2`, `ingestion-worker-v2`, and `control-center-v2`.

## 2) Delivered in v2.1

### 2.1 Storage Ownership and Routing

1. Control service owns artifact and output storage routing policy.
2. Ingestion downloadable JSON routing moved from worker bootstrap env to run-scoped `StartRun.outputSinks[].delivery`.
3. Crawler continues using run-scoped `artifactSink`.
4. Ingestion legacy bootstrap vars `OUTPUTS_BUCKET` and `OUTPUTS_PREFIX` were removed from active ownership and docs.

### 2.2 Start Ordering and Dependency Safety

1. Control service performs worker dependency preflight (`/readyz`) before dispatch.
2. For `crawl_and_ingest`, ingestion `StartRun` is dispatched and accepted before crawler `StartRun`.
3. Startup rollback path exists: if crawler dispatch fails after ingestion accepted, control service triggers ingestion cancel with `reason: startup_rollback`.
4. Failure handling exists for rollback-cancel failure (`startup_rollback_cancel_failed`).

### 2.3 Ingestion Message Processing Semantics

1. Ingestion subscription lifecycle and consumer gating are implemented around accepted run state.
2. ACK/NACK behavior is explicit:
   1. ACK only after successful processing and Mongo persistence.
   2. Transient failures are retried (NACK or ack deadline expiry).
   3. Permanent deterministic failures are stored as failed and ACKed.
3. Unmatched events are handled as `no_matching_run` without local backlog persistence.

### 2.4 Cancellation Contract and Behavior

1. Ingestion cancel endpoint path remains `POST /v1/runs/:runId/cancel`.
2. Typed cancel reason support is delivered:
   1. `startup_rollback`
   2. `operator_request`
3. Operator cancellation semantics are defined and tested as graceful stop-plus-drain behavior.

### 2.5 Env Alignment and Documentation

1. Shared GCP/PubSub env group is aligned and documented across services.
2. Control-service artifact storage envs are documented as routing ownership.
3. `.env.example`, READMEs, tests, and contracts were updated in the coordinated v2.1 change.

## 3) Deferred to v3

### 3.1 Cancellation API Expansion for Running Jobs

1. Keep current cancel endpoint and reason contract from v2.1 as baseline.
2. Expand operator cancellation handling for true long-running interrupt semantics:
   1. clearer in-flight job cutoff policy,
   2. explicit end-state and timing guarantees per worker,
   3. richer operator-facing progress feedback during drain.

### 3.2 Orchestration Reliability Hardening

1. Keep v2.1 preflight and ordered dispatch model.
2. Add stronger orchestration safeguards:
   1. explicit retry budget policy and escalation path,
   2. stronger idempotency/duplicate-start protections at service boundaries,
   3. improved recovery playbooks for partial startup or partial cancel outcomes.

### 3.3 Operational Observability and Runbooks

1. Expand diagnostics for dependency failures, retry loops, and startup rollback frequency.
2. Add standardized runbooks for:
   1. worker unavailable,
   2. startup rollback failed,
   3. prolonged cancellation drain.
3. Add UI/operator-facing diagnostics for these scenarios where currently only service logs are detailed.

### 3.4 Queue and Throughput Protection Review

1. Keep current Pub/Sub-backed queue behavior and no local backlog in v2.1.
2. Review and tune redelivery/backpressure behavior under higher throughput and failure spikes.
3. Decide whether additional guardrails are required beyond current ACK/NACK policy.

### 3.5 Configuration Model Simplification

Detailed implementation scope is tracked in:
`docs/specs/configuration-model-v2-2.md`.

1. Remove duplicate ingestion control by making `pipeline.mode` the single source of truth.
2. Remove `enableIngestion` from runtime profile.
3. Current post-create non-editable behavior is not acceptable for v3.
4. Pipeline detail must support editing of operator-owned fields after creation: `name` and `mode`.
5. Runtime profile detail must support editing of operator-owned fields after creation: `name`, `crawler.maxConcurrency`, `crawler.maxRequestsPerMinute`, `ingestion.concurrency` (mode-gated), and `debugLogsEnabled`.
6. Search space detail must support editing of operator-owned fields after creation: `name`, `maxItems`, `allowInactiveMarking` (output-gated), and `description`.
7. Pipeline creation form must not expose `runtimeProfileId` or `searchSpaceId`.
8. On pipeline creation, runtime profile ID and search space ID are system-generated.
9. IDs are system generated and not operator-editable: `pipelineId`, `runtimeProfileId`, and `searchSpaceId`.
10. Runtime profile remains execution-tuning only.
11. Search space editable fields remain limited to `name`, `maxItems`, `allowInactiveMarking`, and `description`.
12. UI rule: when `pipeline.mode = crawl_only`, ingestion concurrency is visible but not editable.
13. UI rule: when `pipeline.mode = crawl_and_ingest`, ingestion concurrency is editable and applied.
14. Pipeline Detail must expose editable sections for all three domains after creation: Pipeline, Search Space, and Runtime Profile.
15. `allowInactiveMarking` is available only when structured output includes `mongodb`.
16. If structured output is `downloadable_json` only (no `mongodb`), `allowInactiveMarking` is not editable and must resolve to `false`.

## 4) Deferred Beyond v3 (Current Direction)

1. User-owned bucket and tenant-isolated storage policy ownership (targeted for v4).
2. DLQ redrive and deeper broker-level replay workflows (targeted for v4).
3. Dynamic bootstrap orchestration to reduce duplicated static infra env configuration (targeted for v4).

## 5) v3 Spec Authoring Inputs

When writing the detailed v3 implementation spec, keep these fixed constraints from v2.1:

1. Simplicity before compatibility complexity for this release train.
2. Coordinated rollout across control service and workers is acceptable.
3. Queue memory remains Pub/Sub subscription behavior; avoid introducing local backlog storage unless justified.
4. Storage routing ownership remains in control service.
5. `pipeline.mode` is the only ingestion on/off switch; runtime profile must not duplicate it.

## 6) Acceptance Gate for v3 Spec Completion

A v3 spec should be considered complete when it defines:

1. Exact API/state changes for cancellation and orchestration hardening.
2. Failure matrix and expected end-state transitions for each failure class.
3. Test matrix covering nominal flow, startup rollback, operator cancel, and retry exhaustion.
4. Operational dashboard metrics and runbook links required at release time.
5. UI and API validation rules for the simplified configuration model and mode-driven editability.
