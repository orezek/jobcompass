# Spec Draft: Crawler + Ingestion Control Plane v2

## Status

- draft
- follow-up scope after v1 implementation, review, and testing

## Purpose

Capture the features intentionally deferred from v1 so they stay visible without destabilizing the first implementation.

## V2 Themes

- scheduling and recurring automation
- production cloud deployment for workers
- richer orchestration and replay
- broader source support
- more advanced stateful pipeline capabilities
- published machine-readable API contracts

## Deferred Features

### 1. Scheduled Runs

V2 should add:

- cron-based run scheduling
- recurring pipeline execution
- schedule pause and resume
- misfire handling
- per-schedule audit trail

This is deferred from v1 because:

- v1 already has enough scope in the control plane, workers, broker, artifact storage, and output routing
- manual and API-triggered runs are enough for initial validation

### 2. Production Worker Deployment

V2 should define the production deployment target for workers.

Current preferred direction:

- Next.js control plane on Vercel
- crawler and ingestion workers on Google Cloud managed container runtime

Cloud Run is a strong candidate for workers.

Areas to finalize in v2:

- whether crawler runs best as a service, a job, or a hybrid model
- whether ingestion runs best as an event-driven service, a job, or separate item/batch forms
- worker scaling and concurrency policy
- VPC, secrets, and service-account model

Current working recommendation:

- crawler is more naturally modeled as a job-style runtime
- ingestion may need two runtime shapes:
  - event-driven item ingestion
  - batch reingestion job execution

### 3. Richer Orchestration

V2 may add an orchestration layer on top of direct worker subscriptions.

Potential additions:

- orchestrator topic or workflow layer
- pipeline branching
- richer dependency management
- explicit replay orchestration
- operator-driven requeue policies

V1 should avoid this complexity and keep direct subscription.

### 4. Advanced Replay And Recovery

V2 should add:

- replay from run manifest
- replay from artifact store
- selective item reprocessing
- sink repair workflows
- batch rebuild of normalized outputs

### 5. Multi-Source Expansion

V2 should add real support for additional websites through the source-adapter contract introduced in v1.

Potential additions:

- adapter registry
- per-source UI forms
- source-specific validation and preview
- source-specific anti-blocking runtime policies

### 6. Extended Crawl Input Modes

V2 should add:

- direct detail-URL runs
- mixed list/detail input support where useful
- explicit URL classification in the operator model
- clearly specified list-page behavior when Mongo-backed reconciliation is not used

V1 should keep the crawler aligned with the current list-page-driven implementation.

### 7. Extended Output Templates

V2 may add:

- template editor for internal admins
- template compatibility matrix per sink
- per-template validation preview
- user-selectable download packaging

V1 should keep templates predefined and controlled by us.

### 8. Additional Persistent State Models

V2 may explore alternatives or additions to MongoDB-backed normalized state for reconciliation and cross-run intelligence.

Examples:

- state store abstraction beyond MongoDB
- search-space run baselines
- crawl history indexes for non-ingesting pipelines

V1 should keep reconciliation tied to persistent normalized state availability.

### 9. Result Reuse And Token Optimization

V2 or later should add a mechanism to reuse previously successful processing results.

The goal is:

- if the same job ad or effectively identical artifact appears again
- the platform can reuse the prior successful normalized result
- unnecessary LLM calls and token spend are avoided

Potential building blocks:

- HTML checksum-based lookup
- canonical artifact fingerprinting
- normalized-result cache keyed by source and artifact fingerprint
- explicit cache hit and cache miss observability

This is intentionally deferred until the v1 pipeline contracts are stable.

### 10. OpenAPI And Swagger

V2 should publish the control-plane API in a machine-readable and developer-friendly form.

Recommended scope:

- formal OpenAPI contract
- Swagger UI or equivalent API explorer
- typed client generation where useful
- improved developer and operator testing flows

Recommended sequencing:

- v1 keeps the API contract clean and implementation-ready
- v2 publishes the OpenAPI contract and Swagger UI

Reasoning:

- agent and MCP use later will benefit from a stable machine-readable API
- the contract should exist before the agent-facing layer is introduced
- Swagger is useful earlier than the full agent platform roadmap

## Later-Phase Roadmap Beyond V2

These ideas are important but should not shape the immediate v1 or early v2 implementation too aggressively.

### V3-V4 Candidate: Deeper Persistence Decoupling

Later versions may decouple ingestion from direct ownership of persistent writes even further.

Possible direction:

- ingestion focuses on canonical normalization only
- a downstream writer or delivery stage owns sink writes
- sink routing becomes a dedicated pipeline stage

Potential motivations:

- stronger separation of concerns
- easier fan-out to many sinks
- independent retry behavior for normalization vs sink delivery
- better support for more complex output routing

V1 should not do this.

V1 should keep sink writes inside the ingestion worker.

### V5 Candidate: User Spaces And Profiles

V5 should introduce a real multi-user operating model.

Potential scope:

- users
- spaces or workspaces
- memberships and ownership
- profile settings
- pipeline ownership boundaries
- run visibility boundaries by space

This should come only after the platform model is stable enough to justify tenancy and ownership rules.

### V6 Candidate: Agent-First Platform Usage

V6 should make the platform a first-class system for API and agent usage.

Potential scope:

- MCP server
- API keys for programmatic access
- key scopes and permissions
- agent-oriented automation flows
- stronger machine-consumable contracts

### V6 Candidate: Unified Usage Attribution And Tracing

V6 should add a usage model that can trace both GUI and API activity.

This should be principal-based, not API-key-only.

That means:

- GUI activity is attributed to a user or session principal
- API activity is attributed to an API key and its owning principal
- later agent activity is attributed to an agent principal or delegated credential

Potential scope:

- API keys
- usage attribution
- audit logs
- quotas and rate limits
- per-principal usage views
- per-key usage views
- cross-channel tracing for GUI, API, and agents

## V1 To V2 Handoff Questions

These questions should be revisited only after v1 is working in practice:

- Is direct worker subscription still sufficient?
- Do operators need scheduling urgently enough to justify a scheduler service?
- Is Cloud Run the right production runtime for both workers?
- Do we need separate runtime shapes for long list crawls versus event-driven ingestion?
- Are the predefined output templates sufficient?
- Do we need richer replay and repair tooling?
