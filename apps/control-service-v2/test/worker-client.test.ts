import assert from 'node:assert/strict';
import test from 'node:test';
import {
  crawlerStartRunRequestV2Fixture,
  ingestionStartRunRequestV2Fixture,
  startRunAcceptedResponseV2Schema,
  startRunRejectedResponseV2Schema,
} from '@repo/control-plane-contracts/v2';
import { WorkerClient, WorkerClientError } from '../src/worker-client.js';
import type { EnvSchema } from '../src/env.js';

function createEnv(overrides: Partial<EnvSchema> = {}): EnvSchema {
  return {
    PORT: 8080,
    HOST: '0.0.0.0',
    SERVICE_NAME: 'control-service-v2',
    SERVICE_VERSION: 'test',
    LOG_LEVEL: 'silent',
    LOG_PRETTY: false,
    CONTROL_SHARED_TOKEN: 'test-token',
    MONGODB_URI: 'mongodb://localhost:27017/omnicrawl',
    CONTROL_PLANE_DB_NAME: 'control-plane',
    CRAWLER_WORKER_BASE_URL: 'http://crawler-worker:3010',
    INGESTION_WORKER_BASE_URL: 'http://ingestion-worker:3020',
    CONTROL_PLANE_ARTIFACT_STORAGE_BACKEND: 'local_filesystem',
    CONTROL_PLANE_ARTIFACT_STORAGE_LOCAL_BASE_PATH: 'control-plane-artifacts',
    CONTROL_PLANE_ARTIFACT_STORAGE_GCS_BUCKET: undefined,
    CONTROL_PLANE_ARTIFACT_STORAGE_GCS_PREFIX: '',
    CONTROL_PLANE_JSON_BUNDLE_MAX_BYTES: 104_857_600,
    CONTROL_PLANE_JSON_BUNDLE_TIMEOUT_MS: 120_000,
    CONTROL_PLANE_SKIP_SINK_PREFLIGHT: true,
    GCP_PROJECT_ID: 'omnicrawl-dev',
    PUBSUB_EVENTS_TOPIC: 'run-events',
    PUBSUB_EVENTS_SUBSCRIPTION: 'control-service-events',
    PUBSUB_AUTO_CREATE_SUBSCRIPTION: true,
    ENABLE_PUBSUB_CONSUMER: true,
    SSE_HEARTBEAT_INTERVAL_MS: 15_000,
    ...overrides,
  };
}

test('startIngestionRun retries on transient worker error and then succeeds', async () => {
  const env = createEnv();
  const client = new WorkerClient(env);
  const accepted = startRunAcceptedResponseV2Schema.parse({
    contractVersion: 'v2',
    ok: true,
    runId: ingestionStartRunRequestV2Fixture.runId,
    workerType: 'ingestion',
    accepted: true,
    deduplicated: false,
    state: 'accepted',
    message: 'Run accepted.',
  });
  const rejected = startRunRejectedResponseV2Schema.parse({
    contractVersion: 'v2',
    ok: false,
    accepted: false,
    deduplicated: false,
    state: 'rejected',
    workerType: 'ingestion',
    runId: ingestionStartRunRequestV2Fixture.runId,
    error: {
      code: 'WORKER_TEMPORARY_FAILURE',
      message: 'Temporary outage.',
    },
  });

  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) {
      return new Response(JSON.stringify(rejected), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(accepted), {
      status: 202,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const response = await client.startIngestionRun(ingestionStartRunRequestV2Fixture);
    assert.equal(response.ok, true);
    assert.equal(response.accepted, true);
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('startCrawlerRun does not retry on non-retryable worker rejection', async () => {
  const env = createEnv();
  const client = new WorkerClient(env);
  const rejected = startRunRejectedResponseV2Schema.parse({
    contractVersion: 'v2',
    ok: false,
    accepted: false,
    deduplicated: false,
    state: 'rejected',
    workerType: 'crawler',
    runId: crawlerStartRunRequestV2Fixture.runId,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid payload.',
    },
  });

  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    return new Response(JSON.stringify(rejected), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    await assert.rejects(
      client.startCrawlerRun(crawlerStartRunRequestV2Fixture),
      (error: unknown) => {
        assert.ok(error instanceof WorkerClientError);
        assert.equal(error.message, 'Invalid payload.');
        return true;
      },
    );
    assert.equal(attempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('cancelCrawlerRun omits JSON content-type when body is absent', async () => {
  const env = createEnv();
  const client = new WorkerClient(env);
  const originalFetch = globalThis.fetch;
  let requestInit: RequestInit | undefined;

  globalThis.fetch = async (_input, init) => {
    requestInit = init;
    return new Response(null, { status: 202 });
  };

  try {
    const result = await client.cancelCrawlerRun('run-abc');
    assert.equal(result, 'accepted');

    const headers = new Headers(requestInit?.headers);
    assert.equal(headers.get('authorization'), 'Bearer test-token');
    assert.equal(headers.get('content-type'), null);
    assert.equal(requestInit?.body, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
