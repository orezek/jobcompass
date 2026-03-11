# v2.3 Current Snapshot and v3 Roadmap

Status: Draft  
Owner: Platform  
Date: 2026-03-11  
Current Release: v2.3.0

## 1) Purpose

This document captures:

1. The currently delivered platform scope as of `v2.3.0`.
2. The planned route for upcoming minor versions (`v2.4+`).
3. The consolidation goals for `v3.0`.

## 2) Current Snapshot (Delivered in v2.3.0)

### 2.1 Control Plane and Worker Architecture

1. Platform operates with `control-service-v2`, `control-center-v2`, `crawler-worker-v2`, and
   `ingestion-worker-v2`.
2. Control service orchestrates run lifecycle, worker dispatch, cancellation, and run projections.
3. Worker startup dependency checks and ordered dispatch semantics are active for
   `crawl_and_ingest` mode.

### 2.2 Cancellation and Drain Semantics

1. Cancel endpoint contract is active for operator and rollback flows.
2. Crawler cancellation stops active crawl execution and finalizes the crawler run.
3. Ingestion operator cancellation performs graceful drain before finalization.

### 2.3 Configuration and Sink Ownership

1. Pipeline mode remains the ingestion on/off source of truth.
2. Operator sink (`mongodbUri` + `dbName`) is pipeline-configurable.
3. Worker sink acquisition/release lifecycle is run-scoped and keyed by sink identity.
4. Artifact and downloadable JSON routing are control-service owned and run-scoped.

### 2.4 Run Detail and Artifact Access

1. Run Detail includes JSON artifact listing and download flows.
2. Control center status rendering distinguishes operator-cancel outcomes in UI while preserving
   canonical run status values.

## 3) Planned Minor Version Route (Before v3)

### 3.1 v2.4: Pipeline Scheduling (CRON)

1. Add schedule definitions on pipelines (CRON syntax and timezone handling).
2. Add scheduler execution loop and run trigger policy for scheduled runs.
3. Add visibility in control center for next run time, last scheduled run, and schedule health.

### 3.2 v2.5: User Spaces and Authentication

1. Add authenticated user identity and session model.
2. Introduce user-owned spaces so pipelines/runs are scoped per user.
3. Keep platform-owned control-plane data in canonical system DB (`omnicrawl-control-plane` naming
   convention), while user structured-output sinks remain BYO via connection URI.
4. Keep artifact handling platform-owned with user/space-safe prefix partitioning.

### 3.3 v2.6: Source-Specific Crawl and Ingestion Models

1. Keep two-worker architecture (`crawler-worker-v2`, `ingestion-worker-v2`).
2. Add source-specific crawler model settings/options.
3. Add source-specific ingestion/extraction model settings/options.
4. Add control-plane contract support for source profile selection and validation.

### 3.4 v2.7: Proxy and Network Execution Options

1. Add crawler runtime proxy configuration options.
2. Add Apify proxy support as a first-class option.
3. Add diagnostics for proxy routing, failures, and fallback behavior.

### 3.5 v2.8: Multi-Provider LLM Routing

1. Add provider abstraction for ingestion LLM calls.
2. Support multi-provider model configuration (for example Gemini/OpenAI/Anthropic-compatible
   adapters).
3. Add provider-level retry and cost/latency telemetry in ingestion summaries.

## 4) v3.0 Convergence Goals

1. Authenticated multi-space operation as default platform mode.
2. Scheduling integrated into pipeline lifecycle and controls.
3. Source profile system (crawler + ingestion model strategy) fully governed by control-plane
   contracts.
4. Proxy and LLM provider routing standardized as configurable runtime policy layers.

## 5) Acceptance Gate for v3 Planning Readiness

A detailed `v3.0` implementation spec is ready when it defines:

1. Tenant/auth ownership model and authorization boundaries.
2. Scheduler model with failure/retry semantics and visibility requirements.
3. Source-profile contract model (selection, validation, migration strategy).
4. Proxy and multi-LLM provider abstraction boundaries and fallback behavior.
5. Test matrix for scheduling, auth scoping, source-specific pipelines, and provider/proxy options.
