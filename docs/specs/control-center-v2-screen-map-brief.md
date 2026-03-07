# Spec Draft: Control Center v2 Screen Map Brief

## Status

- draft
- UI design handoff brief for `control-center-v2`
- companion to:
  - `docs/specs/control-plane-v2-pipeline-first.md`
  - `docs/specs/control-service-v2-architecture.md`
  - `docs/specs/crawler-ingestion-control-plane-v2.md`

## Purpose

Define the minimum screen map and interaction contract the UI designer should use for
`control-center-v2`.

This brief exists so the UI work does not invent new backend responsibilities or drift away from
the pipeline-first v2 model.

## Product Goal

- `control-center-v2` is an operator UI only
- it submits commands to `control-service`
- it reads live state from `control-service`
- it does not call worker APIs directly
- it does not read Pub/Sub directly
- it does not read pipeline-owned databases directly

The UI should unify crawler and ingestion into one operator experience.

## Frontend Stack Rules

Canonical V2 MVP frontend stack:

- Next.js using the App Router only
- Tailwind CSS
- shadcn/ui on top of Radix UI primitives
- `react-hook-form` plus `zod` for operator forms

App-local decision note:

- this is a deliberate app-local frontend stack for `control-center-v2`
- it is not an existing monorepo-wide UI standard

Routing rule:

- use the `app/` directory only
- do not use the Pages Router
- do not use `getServerSideProps`

Component split:

- use Server Components for initial REST-backed page loads
- use Client Components only where interactivity is required:
  - forms
  - SSE listeners
  - interactive controls

Network boundary rule:

- Server Components must call a server-only `control-service` backend client directly
- do not call local Next.js Route Handlers from Server Components during page loads
- Route Handlers should be used only for:
  - browser-side mutations
  - client-triggered refresh flows
  - SSE proxying

## Layout Direction

Canonical layout rule for V2 MVP:

- mobile-first
- desktop must be fully supported
- mobile is not a reduced-feature afterthought
- prioritize clear run status, recent activity, and primary operator actions in narrow viewports

App-shell rule:

- desktop should use a persistent left sidebar
- mobile should use a drawer or bottom navigation
- the persistent sidebar must not be rendered on narrow viewports
- dense data views must collapse into stacked cards on mobile rather than forcing table-only layouts

Design-system direction:

- visual direction: "Swiss Authority meets Lab Report"
- dark theme only for V2 MVP
- use CSS variables for the theme
- favor sharp corners with little or no rounding
- avoid box shadows
- use skeleton loaders instead of spinners

Theme tokens:

- canvas/background: `#0B0F14`
- surfaces: `#0A1A2B`
- structure/borders: `#2A3440`
- primary text: `#E9E5DC`
- accent: `#132F57`

Typography:

- UI sans: Neue Haas Grotesk or Helvetica Now Text if licensed and available
- fallback sans: Inter, `system-ui`, sans-serif
- data mono: IBM Plex Mono or `ui-monospace`, monospace
- data labels should prefer tabular numerals and uppercase treatment where appropriate

## Required Page And Route Map

The first design pass should define actual routes for these screens:

1. pipeline list
   - example route: `/pipelines`
2. create pipeline
   - example route: `/pipelines/new`
3. pipeline detail
   - example route: `/pipelines/{pipelineId}`
4. run list
   - example route: `/runs`
5. run detail
   - example route: `/runs/{runId}`

Optional shell/navigation elements:

- top navigation or bottom navigation for mobile
- persistent service status indicator
- live connection status indicator

## Screen-Level Data Contracts

The design pass must map each screen to its data source and live-update behavior.

### 1. Pipeline List

- primary endpoint:
  - `GET /v1/pipelines`
- primary actions:
  - create pipeline
  - open pipeline detail
  - start run
- default behavior:
  - sort by `updatedAt` descending
  - no custom pagination required in the first screen pass unless real volume requires it
- live update rule:
  - load via REST
  - refresh via SSE-triggered revalidation when pipeline-adjacent run state changes matter to the
    list

### 2. Create Pipeline

- primary endpoint:
  - `POST /v1/pipelines`
- required fields:
  - `name`
  - `source`
  - `mode`
  - `searchSpace`
  - `runtimeProfile`
  - `structuredOutput`
- design constraint:
  - no separate CRUD screens for search spaces, runtime profiles, or structured outputs
- live update rule:
  - form is request/response only
  - no SSE dependency for the create form itself

### 3. Pipeline Detail

- primary endpoints:
  - `GET /v1/pipelines/{pipelineId}`
  - `GET /v1/runs?pipelineId={pipelineId}`
  - `PATCH /v1/pipelines/{pipelineId}`
  - `POST /v1/pipelines/{pipelineId}/runs`
- allowed edit scope:
  - `name` only
- default behavior:
  - recent runs sorted by `requestedAt` descending
  - default recent run count can be small in the first pass
- live update rule:
  - load via REST
  - subscribe via SSE for run changes related to the current pipeline

### 4. Run List

- primary endpoint:
  - `GET /v1/runs`
- supported filters:
  - `pipelineId`
  - `status`
  - `source`
  - `limit`
  - `cursor`
- default behavior:
  - sort by `requestedAt` descending
  - default filter is all pipelines
  - default limit should be small and mobile-friendly
- live update rule:
  - load via REST
  - apply SSE updates for visible rows
  - re-fetch current filter set after reconnect

### 5. Run Detail

- primary endpoints:
  - `GET /v1/runs/{runId}`
  - `GET /v1/runs/{runId}/events`
  - `POST /v1/runs/{runId}/cancel`
- required data:
  - overall run status
  - crawler status
  - ingestion status
  - timestamps
  - error or stop summary
  - event timeline
- default behavior:
  - event timeline ordered by `occurredAt` descending unless a clearer mobile timeline requires
    ascending order
  - event pagination uses `cursor` and `limit`
- live update rule:
  - load via REST
  - append live SSE events for the active run
  - re-fetch run header and current event page after reconnect

## REST Refresh vs SSE Rules

The design must assume this split:

- REST is the source for initial screen load
- REST is the source of truth after reconnect
- SSE is the source for incremental live updates while connected
- the UI must not assume durable replay from SSE

## UI Behavior Rules

The first design pass must include explicit states for:

- loading
- empty
- error
- connected live state
- reconnecting live state
- disconnected/stale state
- run queued
- run running
- run succeeded
- run completed with errors
- run failed
- run stopped

Required interaction rules:

- cancel run must use explicit confirmation
- start run should show accepted state immediately after command success
- rename pipeline should use a simple inline or modal flow, not a full-screen wizard
- reconnect after SSE drop should show stale/live-connection status without blocking normal REST
  navigation
- loading states should use skeleton loaders, not spinners
- empty states should use the "Empty Lab Tray" treatment:
  - dashed border
  - transparent surface
  - centered monospace copy
- all run-status surfaces must support:
  - `queued`
  - `running`
  - `succeeded`
  - `completed_with_errors`
  - `failed`
  - `stopped`

## Operator Access Model

The backend auth contract already exists. V2 does not define end-user authentication inside the
Next.js app.

Canonical V2 rule:

- `control-center-v2` is an internal operator tool in V2
- trusted access should be enforced outside the app at the deployment or network boundary
- the browser must not hold `CONTROL_SHARED_TOKEN` directly
- authenticated calls to `control-service` should go through trusted server-side code in
  `control-center-v2`

Deferred to V3:

- operator identity provider selection
- login/logout UX
- app-level session management
- session-expiry handling
- unauthorized and expired-session screens

SSE proxy rule:

- the browser must not connect directly to `control-service` SSE with the shared bearer token
- native `EventSource` cannot attach custom authorization headers
- `control-center-v2` must expose a same-origin SSE proxy route
- the SSE proxy route should:
  - attach the backend `CONTROL_SHARED_TOKEN` server-side
  - open the downstream `control-service` SSE connection
  - stream chunks back to the browser

## MVP Non-Goals

Do not design first-pass screens for:

- direct worker administration
- direct Pub/Sub inspection
- separate search-space CRUD
- separate runtime-profile CRUD
- separate structured-output CRUD
- pipeline pause
- pipeline resume
- pipeline delete
- dedicated artifact pages
- dedicated output pages
- scheduling

## Required Designer Deliverables

1. page and route map
2. screen inventory with main data and main actions
3. screen-to-endpoint matrix
4. live-update behavior notes per screen
5. loading, empty, error, reconnect, and confirmation states
6. mobile-first responsive behavior notes

## Remaining Open Points

These do not block V2 implementation, but they are still design choices rather than locked rules:

1. mobile navigation shape
   - drawer
   - bottom navigation
   - or a hybrid of both
2. default run-timeline direction on mobile
   - newest first
   - or oldest first for easier chronological scanning
3. premium font availability
   - licensed premium fonts if available
   - otherwise fallback stack only
