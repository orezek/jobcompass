# Source Ingestion Platform

Source Ingestion Platform is a modular ETL system for crawling, extracting, and normalizing
structured data from multiple web sources.

The platform currently runs a control-plane-driven V2 architecture with dedicated crawler and
ingestion workers. The design goal is stable operations now, with planned expansion to additional
sources, provider options, and tenant-aware orchestration in upcoming minor versions.

## Current Snapshot

Current release: `v2.3.0`

Active V2 services:

- `control-service-v2`: Pipeline/run orchestration, state management, worker dispatch, cancellation,
  artifact indexing, and projection APIs.
- `control-center-v2`: Operator UI for pipelines, runs, telemetry, cancellation, and JSON artifact
  access/download.
- `crawler-worker-v2`: Source crawling runtime (Crawlee + Playwright) and crawler event emission.
- `ingestion-worker-v2`: Event-driven ingestion and structured output extraction pipeline.

## Roadmap (Next Minor Versions)

Planned route before and into v3:

1. `v2.4`: Pipeline scheduling with CRON support for automatic runs.
2. `v2.5`: User spaces and authentication, with ownership of pipelines/runs per authenticated user.
3. `v2.6`: Source-aware crawling and ingestion model profiles (per-source crawler behavior and
   extraction model selection while keeping the two-worker architecture).
4. `v2.7`: Proxy/runtime options including Apify proxy support.
5. `v2.8`: Multi-provider LLM support (provider adapters and model routing policies).
6. `v3.0`: Consolidated tenant-aware control plane and scheduling/auth/model routing as first-class
   platform capabilities.

## Documentation

Primary references:

- [CHANGELOG.md](./CHANGELOG.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [docs/README.md](./docs/README.md)
- [docs/specs/v2-1-delivered-and-v3-scope.md](./docs/specs/v2-1-delivered-and-v3-scope.md)
- [docs/specs/configuration-model-v2-2.md](./docs/specs/configuration-model-v2-2.md)

## Getting Started

Prerequisites:

1. Node.js (repo uses `.node-version`, currently Node 24+).
2. pnpm via Corepack.

Install:

```bash
fnm use
corepack enable
pnpm install
```

Common workspace commands:

| Command            | Description                                       |
| ------------------ | ------------------------------------------------- |
| `pnpm dev`         | Start development tasks across workspaces.        |
| `pnpm build`       | Build all workspaces via Turborepo.               |
| `pnpm lint`        | Run ESLint across configured workspaces.          |
| `pnpm format`      | Run Prettier across supported file types.         |
| `pnpm check-types` | Run TypeScript checks without emitting artifacts. |

## License

MIT
