# Create Pipeline Form Specification

Status: Draft (for review)
Owner: Control Center + Control Service
Last updated: 2026-03-11

## Why this is a good idea

Yes. This is standard and recommended.

For operator-facing forms that trigger crawling and ingestion on the public internet, a field-by-field spec is the normal way to keep UI validation, API validation, and runtime behavior aligned.

Without this spec, the UI and API drift (for example, UI blocks values that API still accepts, or API allows values the UI never sends).

## Scope

This spec covers the `Create Pipeline` UI in `control-center-v2` and its create payload contract for `control-service-v2`.

## Principles

1. Validate in both UI and API. UI is for operator feedback; API is the final trust boundary.
2. Use explicit min/max limits for all numeric fields.
3. Use allowlists for operator-facing identifiers.
4. Keep defaults safe for internet crawling and easy on target servers.
5. Keep sensitive fields (Mongo URI) redacted in read responses.
6. Do not silently mutate operator input. If value is invalid (min/max/charset), reject with clear error and require user correction.

## Payload shape (create)

```json
{
  "name": "string",
  "source": "string",
  "mode": "crawl_only | crawl_and_ingest",
  "searchSpace": {
    "name": "string",
    "description": "string",
    "startUrls": ["https://..."],
    "maxItems": 20,
    "allowInactiveMarking": true
  },
  "runtimeProfile": {
    "name": "string",
    "crawlerMaxConcurrency": 1,
    "crawlerMaxRequestsPerMinute": 10,
    "ingestionConcurrency": 4
  },
  "structuredOutput": {
    "destinations": [{ "type": "mongodb" }, { "type": "downloadable_json" }]
  },
  "operatorSink": {
    "mongodbUri": "mongodb+srv://...",
    "dbName": "pipeline_db"
  }
}
```

## Field-by-field specification

### Pipeline section

| Field    | Current UI behavior                      | Current API acceptance    | Proposed standard                                                                                                     |
| -------- | ---------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `name`   | Required, trimmed, max 20 chars          | Required non-empty string | Required, 3-64 chars, allow `[A-Za-z0-9 ._-]`, no silent trimming/collapsing; invalid input must be corrected by user |
| `source` | Editable text input, default `jobs.cz`   | Required non-empty string | Fixed enum in UI and API; for now only `jobs.cz`                                                                      |
| `mode`   | Select: `crawl_only`, `crawl_and_ingest` | Enum of those 2 values    | Keep enum; if `crawl_and_ingest`, require at least one structured output destination                                  |

### Search Space section

| Field                              | Current UI behavior                                                 | Current API acceptance                               | Proposed standard                                                   |
| ---------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| `searchSpace.name`                 | Required, no max/charset in UI                                      | Required non-empty string                            | Required, 3-65 chars, allow `[A-Za-z0-9 ._-]`, no silent trimming   |
| `searchSpace.description`          | Optional text area                                                  | Optional string                                      | Optional, max 1000 chars                                            |
| `searchSpace.startUrls`            | Textarea, 1+ URLs, max 20 URLs, absolute URL check                  | Array of URLs, min 1, no max                         | 1-10 URLs, each absolute `http/https`, max 2048 chars each          |
| `searchSpace.maxItems`             | Number, min 1, max 1000, default 200                                | Positive int, no upper bound                         | Default 20, min 1, max 5000                                         |
| `searchSpace.allowInactiveMarking` | Checkbox; disabled when Mongo output is off or mode is `crawl_only` | Boolean; must be false when Mongo destination absent | Keep behavior; API must enforce false when Mongo destination absent |

Note: URL credential blocking and normalized deduplication are intentionally deferred and out of scope for this spec revision.

### Runtime Profile section

| Field                                        | Current UI behavior                           | Current API acceptance                                                  | Proposed standard                                                                 |
| -------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `runtimeProfile.name`                        | Required text input                           | Required non-empty string                                               | Required, 3-64 chars, allow `[A-Za-z0-9 ._-]`, no silent trimming                 |
| `runtimeProfile.crawlerMaxConcurrency`       | Number min 1 max 20                           | Optional positive int                                                   | Default 1, min 1, max 4                                                           |
| `runtimeProfile.crawlerMaxRequestsPerMinute` | Number min 1 max 600                          | Optional positive int                                                   | Default 10, min 1, max 20                                                         |
| `runtimeProfile.ingestionConcurrency`        | Number min 1 max 64, disabled in `crawl_only` | Optional positive int; required by service logic for `crawl_and_ingest` | Default 4, min 1, max 32; required in `crawl_and_ingest`, omitted in `crawl_only` |

### Structured Output section

| Field                           | Current UI behavior                   | Current API acceptance                                      | Proposed standard                        |
| ------------------------------- | ------------------------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| `structuredOutput.destinations` | MongoDB and Downloadable JSON toggles | Array of destination types (`mongodb`, `downloadable_json`) | Keep; allow empty only for `crawl_only`  |
| `includeMongoOutput` (UI)       | Boolean toggle                        | Encoded as destination type                                 | Keep; when off, disable inactive marking |
| `includeDownloadableJson` (UI)  | Boolean toggle                        | Encoded as destination type                                 | Keep                                     |

### Mongo operator sink section

| Field                     | Current UI behavior                                                            | Current API acceptance                                                                                 | Proposed standard                                                                       |
| ------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `operatorSink.mongodbUri` | Required in create form, URL + scheme check (`mongodb://` or `mongodb+srv://`) | Required non-empty string on create; update optional non-empty string; no URI format validation in API | Required on create, optional on update; API must validate URI + scheme; max length 2048 |
| `operatorSink.dbName`     | Required in create form, regex `[A-Za-z0-9_-]+`, max 38 bytes                  | Same charset + max 38 bytes in API                                                                     | Keep regex + max 38 bytes; add min length 3 for readability/ops consistency             |

## Safety and consistency rules

1. API must mirror UI constraints for all fields above.
2. `allowInactiveMarking` must be forced to `false` unless Mongo destination is present.
3. `crawl_and_ingest` must require:
   - at least one structured output destination,
   - `ingestionConcurrency`.
4. `crawl_only` must omit ingestion runtime settings in worker dispatch payload.
5. `source` should be treated as an enum in API, not free text.

## Known gaps between current behavior and proposed standard

1. `maxItems` default is currently `200`; proposed is `20`.
2. `maxItems` max is currently `1000`; proposed is `5000`.
3. `startUrls` max is currently `20`; proposed is `10`.
4. `crawlerMaxConcurrency` is currently default `3`, max `20`; proposed default `1`, max `4`.
5. `crawlerMaxRequestsPerMinute` is currently default `60`, max `600`; proposed default `10`, max `20`.
6. `ingestionConcurrency` is currently max `64`; proposed max `32`.
7. API currently does not validate `operatorSink.mongodbUri` format/scheme.
8. API currently allows unbounded lengths for `name`, `searchSpace.name`, and `runtimeProfile.name`.

## Recommended implementation order

1. Lock contract-level constraints in `@repo/control-plane-contracts/v2`.
2. Align `control-service-v2` runtime consistency checks with contract constraints.
3. Align `control-center-v2` create/edit form defaults and field limits.
4. Extend e2e tests for the new final limits (`maxItems: 5000`, `startUrls: 10`, runtime ranges, URI contract checks).

## Test baseline mapping

Current e2e baseline already covers required validation paths under `apps/control-center-v2/tests/e2e/`.

When this spec is approved, update tests to match final numbers/regex rules exactly.
