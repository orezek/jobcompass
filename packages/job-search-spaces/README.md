# @repo/job-search-spaces

Shared search-space schemas and runtime helpers for JobCompass apps.

## Responsibilities

- validate named search-space configuration files
- build Apify-compatible actor input from search-space config
- derive per-search-space Mongo database names
- validate runtime search-space identifiers

## Core API

- `searchSpaceConfigSchema`
- `actorRuntimeInputSchema`
- `buildActorInputFromSearchSpace(...)`
- `deriveMongoDbName(...)`
