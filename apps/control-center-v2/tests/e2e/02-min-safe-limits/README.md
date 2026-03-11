# Minimum Safe Limits

This test submits a valid pipeline at the minimum accepted numeric limits.

Focus:

- Verify lower bounds are accepted and serialized correctly:
  - `maxItems=1`
  - `crawlerMaxConcurrency=1`
  - `crawlerMaxRequestsPerMinute=1`
  - `ingestionConcurrency=1`
- Confirm successful create does not start execution automatically.
