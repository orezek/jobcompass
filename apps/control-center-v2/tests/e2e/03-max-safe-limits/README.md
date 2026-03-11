# Maximum Safe Limits

This test submits a valid pipeline at the upper accepted numeric limits.

Focus:

- Verify configured upper bounds are accepted:
  - `maxItems=5000`
  - `crawlerMaxConcurrency=4`
  - `crawlerMaxRequestsPerMinute=20`
  - `ingestionConcurrency=32`
- Confirm payload contains capped values exactly.
- Confirm create action stays isolated from run execution.
