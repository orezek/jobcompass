import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Bucket, Storage } from '@google-cloud/storage';
import type { Topic } from '@google-cloud/pubsub';
import {
  buildCrawlerDetailCapturedEvent,
  buildCrawlerRunFinishedEvent,
  ingestionStartRunRequestV2Schema,
} from '@repo/control-plane-contracts';
import { MongoClient } from 'mongodb';
import type { EnvSchema } from '../../src/env.js';
import { IngestionWorkerRuntime } from '../../src/runtime.js';
import { FakeLogger } from './stubs/fake-logger.js';
import { FakeStorage } from './stubs/fake-storage.js';
import { FakePubSubTopic } from './stubs/fake-topic.js';

type CollectionNames = {
  crawlRunSummaries: string;
  ingestionRunSummaries: string;
  ingestionTriggerRequests: string;
  normalizedJobAds: string;
};

type RunView = {
  status: 'running' | 'succeeded' | 'completed_with_errors' | 'failed' | 'stopped';
  counters: {
    received: number;
    processed: number;
    failed: number;
    rejected: number;
  };
  outputsCount: number;
  waitForCrawlerFinished: boolean;
  crawlerFinished: boolean;
};

type RuntimeFixture = {
  runtime: IngestionWorkerRuntime;
  topic: FakePubSubTopic;
  outputBucket: ReturnType<FakeStorage['bucket']>;
  logger: FakeLogger;
};

const mongoUri = process.env.INGESTION_WORKER_V2_E2E_MONGODB_URI ?? process.env.MONGODB_URI;
const skipReason =
  mongoUri && mongoUri.trim().length > 0
    ? undefined
    : 'Set INGESTION_WORKER_V2_E2E_MONGODB_URI (or MONGODB_URI) before running ingestion-worker-v2 E2E tests.';

const sharedDbName =
  process.env.INGESTION_WORKER_V2_E2E_DB_NAME?.trim() || 'ingestion_worker_v2_shared_e2e';

const collections: CollectionNames = {
  crawlRunSummaries:
    process.env.INGESTION_WORKER_V2_E2E_CRAWL_RUN_SUMMARIES_COLLECTION?.trim() ||
    'crawl_run_summaries',
  ingestionRunSummaries:
    process.env.INGESTION_WORKER_V2_E2E_INGESTION_RUN_SUMMARIES_COLLECTION?.trim() ||
    'ingestion_run_summaries',
  ingestionTriggerRequests:
    process.env.INGESTION_WORKER_V2_E2E_INGESTION_TRIGGER_REQUESTS_COLLECTION?.trim() ||
    'ingestion_trigger_requests',
  normalizedJobAds:
    process.env.INGESTION_WORKER_V2_E2E_NORMALIZED_JOB_ADS_COLLECTION?.trim() ||
    'normalized_job_ads',
};

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureHtmlPath = path.resolve(currentDir, '../fixtures/job-detail.html');

let mongoClient: MongoClient | null = null;

before(async () => {
  if (skipReason) {
    return;
  }

  mongoClient = new MongoClient(mongoUri!);
  await mongoClient.connect();
  await mongoClient.db(sharedDbName).command({ ping: 1 });
});

after(async () => {
  if (!mongoClient) {
    return;
  }

  await mongoClient.close();
  mongoClient = null;
});

function getMongoClient(): MongoClient {
  assert.ok(mongoClient, 'Mongo client is not initialized.');
  return mongoClient;
}

function buildRunId(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function buildRuntimeEnv(): EnvSchema {
  return {
    PORT: 0,
    SERVICE_NAME: 'ingestion-worker-v2-e2e',
    SERVICE_VERSION: '2.0.0-test',
    LOG_LEVEL: 'silent',
    MAX_CONCURRENT_RUNS: 2,
    CONTROL_AUTH_MODE: 'token',
    CONTROL_SHARED_TOKEN: 'test-token',
    CONTROL_JWT_PUBLIC_KEY: undefined,
    GCP_PROJECT_ID: 'test-project',
    PUBSUB_EVENTS_TOPIC: 'test-events',
    PUBSUB_EVENTS_SUBSCRIPTION: undefined,
    PUBSUB_AUTO_CREATE_SUBSCRIPTION: false,
    ENABLE_PUBSUB_CONSUMER: false,
    OUTPUTS_BUCKET: 'test-output-bucket',
    OUTPUTS_PREFIX: 'e2e',
    MONGODB_URI: mongoUri!,
    MONGODB_DB_NAME: sharedDbName,
    MONGODB_INGESTION_RUN_SUMMARIES_COLLECTION: collections.ingestionRunSummaries,
    MONGODB_INGESTION_TRIGGER_REQUESTS_COLLECTION: collections.ingestionTriggerRequests,
    MONGODB_NORMALIZED_JOB_ADS_COLLECTION: collections.normalizedJobAds,
    INGESTION_PARSER_BACKEND: 'fixture',
    GEMINI_API_KEY: undefined,
    LANGSMITH_API_KEY: undefined,
    LLM_EXTRACTOR_PROMPT_NAME: 'jobcompass-job-ad-structured-extractor',
    LLM_CLEANER_PROMPT_NAME: 'jobcompass-job-ad-text-cleaner',
    GEMINI_MODEL: 'gemini-3-flash-preview',
    GEMINI_TEMPERATURE: 0,
    GEMINI_THINKING_LEVEL: 'LOW',
    GEMINI_INPUT_PRICE_USD_PER_1M_TOKENS: 0.5,
    GEMINI_OUTPUT_PRICE_USD_PER_1M_TOKENS: 3,
    DETAIL_PAGE_MIN_RELEVANT_TEXT_CHARS: 100,
    LOG_TEXT_TRANSFORM_CONTENT: false,
    LOG_TEXT_TRANSFORM_PREVIEW_CHARS: 400,
    PARSER_VERSION: 'ingestion-worker-v2-v1-model-test',
  };
}

function buildStartRunPayload(
  runId: string,
  records: Array<{
    sourceId: string;
    dedupeKey: string;
    detailHtmlPath: string;
    datasetFileName?: string;
    datasetRecordIndex?: number;
  }>,
) {
  return ingestionStartRunRequestV2Schema.parse({
    contractVersion: 'v2',
    workerType: 'ingestion',
    runId,
    idempotencyKey: `idmp-${runId}`,
    requestedAt: new Date().toISOString(),
    correlationId: `corr-${runId}`,
    manifestVersion: 2,
    pipelineSnapshot: {
      id: 'pipeline-e2e',
      name: 'Pipeline E2E',
      version: 1,
      mode: 'crawl_and_ingest',
      searchSpaceId: 'search-space-e2e',
      runtimeProfileId: 'runtime-profile-e2e',
      structuredOutputDestinationIds: ['mongo-normalized-jobs', 'downloadable-json-default'],
    },
    runtimeSnapshot: {
      ingestionConcurrency: 2,
      ingestionEnabled: true,
      debugLog: false,
    },
    inputRef: {
      crawlRunId: runId,
      searchSpaceId: 'search-space-e2e',
      records: records.map((record, index) => ({
        sourceId: record.sourceId,
        dedupeKey: record.dedupeKey,
        detailHtmlPath: record.detailHtmlPath,
        datasetFileName: record.datasetFileName ?? 'dataset.json',
        datasetRecordIndex: record.datasetRecordIndex ?? index,
      })),
    },
    persistenceTargets: {
      dbName: sharedDbName,
      crawlRunSummariesCollection: collections.crawlRunSummaries,
      ingestionRunSummariesCollection: collections.ingestionRunSummaries,
      ingestionTriggerRequestsCollection: collections.ingestionTriggerRequests,
      normalizedJobAdsCollection: collections.normalizedJobAds,
    },
    outputSinks: [
      {
        type: 'mongodb',
        collection: collections.normalizedJobAds,
        writeMode: 'upsert',
      },
      {
        type: 'downloadable_json',
        storageType: 'gcs',
        targetPath: `gs://test-output-bucket/e2e/${runId}`,
        writeMode: 'overwrite',
      },
    ],
    eventContext: {
      requestedBy: 'ingestion-worker-v2-e2e',
      tags: {
        suite: 'runtime',
      },
    },
  });
}

async function createRuntimeFixture(): Promise<RuntimeFixture> {
  const topic = new FakePubSubTopic();
  const storage = new FakeStorage();
  const outputBucket = storage.bucket('test-output-bucket');
  const logger = new FakeLogger();
  const runtime = new IngestionWorkerRuntime({
    env: buildRuntimeEnv(),
    logger: logger.asFastifyLogger(),
    eventsTopic: topic as unknown as Topic,
    storage: storage as unknown as Storage,
    outputsBucket: outputBucket as unknown as Bucket,
    mongoClient: getMongoClient(),
  });

  await runtime.initialize();
  runtime.setPubSubConsumerReady(true);

  return { runtime, topic, outputBucket, logger };
}

function getRunView(runtime: IngestionWorkerRuntime, runId: string): RunView {
  return runtime.getRun(runId) as unknown as RunView;
}

async function waitForRunStatus(
  runtime: IngestionWorkerRuntime,
  runId: string,
  expected: RunView['status'],
): Promise<RunView> {
  const timeoutMs = 12_000;
  const pollIntervalMs = 40;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const run = getRunView(runtime, runId);
    if (run.status === expected) {
      return run;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, pollIntervalMs);
    });
  }

  throw new Error(`Timed out waiting for run "${runId}" to reach status "${expected}".`);
}

async function waitForDocument<T>(input: {
  read: () => Promise<T | null>;
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<T> {
  const timeoutMs = input.timeoutMs ?? 12_000;
  const pollIntervalMs = input.pollIntervalMs ?? 50;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const doc = await input.read();
    if (doc) {
      return doc;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, pollIntervalMs);
    });
  }

  throw new Error('Timed out waiting for persisted Mongo document.');
}

async function waitForEventType(
  topic: FakePubSubTopic,
  eventType: string,
  timeoutMs = 5_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = topic.published.some((entry) => {
      const parsed = JSON.parse(entry.payload) as { eventType?: string };
      return parsed.eventType === eventType;
    });
    if (found) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 30);
    });
  }

  throw new Error(`Timed out waiting for event type "${eventType}".`);
}

async function cleanupRunDocuments(runId: string): Promise<void> {
  const db = getMongoClient().db(sharedDbName);
  await Promise.all([
    db.collection(collections.ingestionRunSummaries).deleteMany({ runId }),
    db.collection(collections.ingestionTriggerRequests).deleteMany({ crawlRunId: runId }),
    db.collection(collections.normalizedJobAds).deleteMany({ 'ingestion.runId': runId }),
  ]);
}

const maybeSkip = skipReason ? { skip: skipReason } : {};

test(
  'processes StartRun input records and persists summary, triggers, and normalized documents',
  maybeSkip,
  async () => {
    const runId = buildRunId('e2e-start-run');
    await cleanupRunDocuments(runId);

    try {
      const { runtime, outputBucket, topic } = await createRuntimeFixture();
      const sourceId = '2000905774';
      const dedupeKey = `jobs.cz:search-space-e2e:${runId}:${sourceId}`;
      const payload = buildStartRunPayload(runId, [
        {
          sourceId,
          dedupeKey,
          detailHtmlPath: fixtureHtmlPath,
        },
      ]);

      const response = await runtime.startRun(payload);
      assert.equal(response.ok, true);
      assert.equal(response.accepted, true);
      assert.equal(response.deduplicated, false);

      const run = await waitForRunStatus(runtime, runId, 'succeeded');
      assert.equal(run.counters.received, 1);
      assert.equal(run.counters.processed, 1);
      assert.equal(run.counters.failed, 0);
      assert.equal(run.outputsCount, 1);

      const db = getMongoClient().db(sharedDbName);
      const summary = await waitForDocument({
        read: async () => db.collection(collections.ingestionRunSummaries).findOne({ runId }),
      });
      assert.equal(summary.status, 'succeeded');
      assert.equal(summary.jobsProcessed, 1);
      assert.equal(summary.jobsFailed, 0);

      const itemTrigger = await db
        .collection(collections.ingestionTriggerRequests)
        .findOne({ crawlRunId: runId, triggerType: 'item', sourceId });
      assert.ok(itemTrigger);
      assert.equal(itemTrigger.status, 'succeeded');

      const normalizedDoc = await db
        .collection(collections.normalizedJobAds)
        .findOne({ dedupeKey });
      assert.ok(normalizedDoc);
      assert.equal(normalizedDoc.sourceId, sourceId);
      assert.equal(normalizedDoc.ingestion.runId, runId);

      assert.equal(outputBucket.listObjectPaths().length, 1);

      const publishedEventTypes = topic.published.map((entry) => {
        const parsed = JSON.parse(entry.payload) as { eventType: string };
        return parsed.eventType;
      });
      await waitForEventType(topic, 'ingestion.run.finished');
      assert.ok(publishedEventTypes.includes('ingestion.run.started'));
      assert.ok(publishedEventTypes.includes('ingestion.item.succeeded'));
      assert.ok(
        topic.published.some(
          (entry) => JSON.parse(entry.payload).eventType === 'ingestion.run.finished',
        ),
      );
    } finally {
      await cleanupRunDocuments(runId);
    }
  },
);

test(
  'handles crawler events and finalizes only after crawler.run.finished',
  maybeSkip,
  async () => {
    const runId = buildRunId('e2e-crawler-events');
    await cleanupRunDocuments(runId);

    try {
      const { runtime } = await createRuntimeFixture();
      const payload = buildStartRunPayload(runId, []);
      await runtime.startRun(payload);

      const initialState = getRunView(runtime, runId);
      assert.equal(initialState.status, 'running');
      assert.equal(initialState.waitForCrawlerFinished, true);
      assert.equal(initialState.crawlerFinished, false);

      const sourceId = '2000905775';
      const detailEvent = buildCrawlerDetailCapturedEvent({
        runId,
        crawlRunId: runId,
        searchSpaceId: 'search-space-e2e',
        source: 'jobs.cz',
        sourceId,
        listingRecord: {
          sourceId,
          adUrl: 'https://www.jobs.cz/rpd/2000905775/',
          jobTitle: 'Platform Engineer',
          companyName: 'Example Corp',
          location: 'Prague',
          salary: null,
          publishedInfoText: null,
          scrapedAt: new Date().toISOString(),
          source: 'jobs.cz',
          htmlDetailPageKey: 'job-2000905775.html',
        },
        artifact: {
          artifactType: 'html',
          storageType: 'local_filesystem',
          storagePath: fixtureHtmlPath,
          checksum: 'checksum-2000905775',
          sizeBytes: 2048,
        },
      });

      await runtime.handlePubSubMessage(JSON.stringify(detailEvent));

      const midState = getRunView(runtime, runId);
      assert.equal(midState.status, 'running');

      const finishedEvent = buildCrawlerRunFinishedEvent({
        runId,
        crawlRunId: runId,
        searchSpaceId: 'search-space-e2e',
        status: 'succeeded',
        newJobsCount: 1,
        failedRequests: 0,
        stopReason: 'completed',
      });

      await runtime.handlePubSubMessage(JSON.stringify(finishedEvent));

      const completed = await waitForRunStatus(runtime, runId, 'succeeded');
      assert.equal(completed.counters.received, 1);
      assert.equal(completed.counters.processed, 1);
      assert.equal(completed.crawlerFinished, true);

      const db = getMongoClient().db(sharedDbName);
      const summary = await waitForDocument({
        read: async () => db.collection(collections.ingestionRunSummaries).findOne({ runId }),
      });
      assert.equal(summary.status, 'succeeded');
    } finally {
      await cleanupRunDocuments(runId);
    }
  },
);

test(
  'captures failures in observability collections when item ingestion fails',
  maybeSkip,
  async () => {
    const runId = buildRunId('e2e-failure');
    await cleanupRunDocuments(runId);

    try {
      const { runtime, topic, outputBucket, logger } = await createRuntimeFixture();
      const sourceId = 'missing-2000905776';
      const dedupeKey = `jobs.cz:search-space-e2e:${runId}:${sourceId}`;
      const payload = buildStartRunPayload(runId, [
        {
          sourceId,
          dedupeKey,
          detailHtmlPath: `/tmp/ingestion-worker-v2-${runId}.html`,
        },
      ]);

      await runtime.startRun(payload);
      const run = await waitForRunStatus(runtime, runId, 'completed_with_errors');

      assert.equal(run.counters.received, 1);
      assert.equal(run.counters.processed, 0);
      assert.equal(run.counters.failed, 1);
      assert.equal(run.outputsCount, 0);
      assert.equal(outputBucket.listObjectPaths().length, 0);

      const db = getMongoClient().db(sharedDbName);
      const summary = await waitForDocument({
        read: async () => db.collection(collections.ingestionRunSummaries).findOne({ runId }),
      });
      assert.equal(summary.status, 'completed_with_errors');
      assert.equal(summary.jobsProcessed, 0);
      assert.equal(summary.jobsFailed, 1);

      const itemTrigger = await db
        .collection(collections.ingestionTriggerRequests)
        .findOne({ crawlRunId: runId, triggerType: 'item', sourceId });
      assert.ok(itemTrigger);
      assert.equal(itemTrigger.status, 'failed');
      assert.match(String(itemTrigger.errorMessage), /ENOENT/);

      const publishedEventTypes = topic.published.map((entry) => {
        const parsed = JSON.parse(entry.payload) as { eventType: string };
        return parsed.eventType;
      });
      await waitForEventType(topic, 'ingestion.run.finished');
      assert.ok(publishedEventTypes.includes('ingestion.item.failed'));
      assert.ok(
        topic.published.some(
          (entry) => JSON.parse(entry.payload).eventType === 'ingestion.run.finished',
        ),
      );

      const errorLogs = logger.entries.filter((entry) => entry.level === 'error');
      assert.equal(errorLogs.length, 0);
    } finally {
      await cleanupRunDocuments(runId);
    }
  },
);
