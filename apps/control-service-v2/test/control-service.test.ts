import assert from 'node:assert/strict';
import test from 'node:test';
import type { ClientSession } from 'mongodb';
import {
  controlPlanePipelineV2Fixture,
  listControlPlanePipelinesResponseV2Schema,
  listControlPlaneRunEventsResponseV2Schema,
  listControlPlaneRunsResponseV2Schema,
} from '@repo/control-plane-contracts/v2';
import { ControlService } from '../src/control-service.js';
import { WorkerClientError } from '../src/worker-client.js';
import type { EnvSchema } from '../src/env.js';
import type { ControlPlaneStore } from '../src/repository.js';
import { ControlServiceState } from '../src/service-state.js';
import { StreamHub } from '../src/stream-hub.js';
import type {
  ControlPlanePipeline,
  ControlPlaneRun,
  ControlPlaneRunEventIndex,
  ControlPlaneRunManifest,
} from '../src/run-model.js';

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
    CONTROL_PLANE_ARTIFACT_STORAGE_BACKEND: 'gcs',
    CONTROL_PLANE_ARTIFACT_STORAGE_LOCAL_BASE_PATH: 'control-plane-artifacts',
    CONTROL_PLANE_ARTIFACT_STORAGE_GCS_BUCKET: 'control-plane-artifacts',
    CONTROL_PLANE_ARTIFACT_STORAGE_GCS_PREFIX: 'runs',
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

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {},
    trace() {},
    fatal() {},
    child() {
      return this;
    },
  } as const;
}

function withStoredSinkSecret(
  pipeline: ControlPlanePipeline,
  mongodbUri = 'mongodb://localhost:27017',
): ControlPlanePipeline {
  return {
    ...pipeline,
    operatorSink: {
      ...pipeline.operatorSink,
      mongodbUri,
      hasMongoUri: true,
    },
  };
}

class InMemoryStore implements ControlPlaneStore {
  public readonly pipelines = new Map<string, ControlPlanePipeline>();
  public readonly runs = new Map<string, ControlPlaneRun>();
  public readonly manifests = new Map<string, ControlPlaneRunManifest>();
  public readonly events = new Map<string, ControlPlaneRunEventIndex>();
  public readonly jsonArtifacts = new Map<
    string,
    {
      artifactId: string;
      runId: string;
      pipelineId: string;
      fileName: string;
      storagePath: string;
      sizeBytes: number;
      createdAt: string;
    }
  >();
  public readonly deleteJobs = new Map<
    string,
    {
      _id: string;
      pipelineId: string;
      status: 'deleting' | 'deleted' | 'delete_failed';
      progress: { totalSteps: number; completedSteps: number };
      lastError?: { code: string; message: string };
      attempts: number;
      createdAt: string;
      updatedAt: string;
    }
  >();

  public async ensureIndexes(): Promise<void> {}

  public async withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
    return fn({} as ClientSession);
  }

  public async createPipeline(pipeline: ControlPlanePipeline): Promise<ControlPlanePipeline> {
    this.pipelines.set(pipeline.pipelineId, pipeline);
    return pipeline;
  }

  public async getPipeline(pipelineId: string): Promise<ControlPlanePipeline | null> {
    return this.pipelines.get(pipelineId) ?? null;
  }

  public async replacePipeline(
    pipeline: ControlPlanePipeline,
  ): Promise<ControlPlanePipeline | null> {
    if (!this.pipelines.has(pipeline.pipelineId)) {
      return null;
    }

    this.pipelines.set(pipeline.pipelineId, pipeline);
    return pipeline;
  }

  public async listPipelines(_query: { limit: number; cursor?: string | undefined }) {
    return listControlPlanePipelinesResponseV2Schema.parse({
      items: [...this.pipelines.values()],
      nextCursor: null,
    });
  }

  public async createRunAndManifest(input: {
    run: ControlPlaneRun;
    manifest: ControlPlaneRunManifest;
  }): Promise<void> {
    this.runs.set(input.run.runId, input.run);
    this.manifests.set(input.manifest.runId, input.manifest);
  }

  public async getRun(runId: string, _session?: ClientSession): Promise<ControlPlaneRun | null> {
    return this.runs.get(runId) ?? null;
  }

  public async getRunManifest(
    runId: string,
    _session?: ClientSession,
  ): Promise<ControlPlaneRunManifest | null> {
    return this.manifests.get(runId) ?? null;
  }

  public async replaceRun(
    run: ControlPlaneRun,
    _session?: ClientSession,
  ): Promise<ControlPlaneRun> {
    this.runs.set(run.runId, run);
    return run;
  }

  public async insertRunEvent(
    event: ControlPlaneRunEventIndex,
  ): Promise<ControlPlaneRunEventIndex> {
    if (this.events.has(event.eventId)) {
      const duplicate = new Error('Duplicate key');
      Object.assign(duplicate, { code: 11_000 });
      throw duplicate;
    }

    this.events.set(event.eventId, event);
    return event;
  }

  public async updateRunEventProjectionStatus(
    eventId: string,
    projectionStatus: 'applied' | 'orphaned',
  ): Promise<void> {
    const event = this.events.get(eventId);
    if (!event) {
      return;
    }

    this.events.set(eventId, {
      ...event,
      projectionStatus,
    });
  }

  public async findActiveRunForPipeline(pipelineId: string): Promise<ControlPlaneRun | null> {
    for (const run of this.runs.values()) {
      if (run.pipelineId === pipelineId && (run.status === 'queued' || run.status === 'running')) {
        return run;
      }
    }

    return null;
  }

  public async listRuns(_query: {
    pipelineId?: string | undefined;
    status?: 'queued' | 'running' | 'succeeded' | 'completed_with_errors' | 'failed' | 'stopped';
    source?: string | undefined;
    limit: number;
    cursor?: string | undefined;
  }) {
    return listControlPlaneRunsResponseV2Schema.parse({
      items: [...this.runs.values()],
      nextCursor: null,
    });
  }

  public async listRunEvents(
    _runId: string,
    _query: { limit: number; cursor?: string | undefined },
  ) {
    return listControlPlaneRunEventsResponseV2Schema.parse({
      items: [...this.events.values()],
      nextCursor: null,
    });
  }

  public async upsertRunJsonArtifactIndexRecord(
    item: {
      artifactId: string;
      runId: string;
      pipelineId: string;
      fileName: string;
      storagePath: string;
      sizeBytes: number;
      createdAt: string;
    },
    _session?: ClientSession,
  ) {
    this.jsonArtifacts.set(`${item.runId}:${item.artifactId}`, item);
    return item;
  }

  public async listRunJsonArtifacts(
    runId: string,
    _query: {
      limit: number;
      cursor?: string | undefined;
      sortBy: 'createdAt' | 'fileName';
      sortDir: 'asc' | 'desc';
      fileNamePrefix?: string | undefined;
    },
  ) {
    const items = [...this.jsonArtifacts.values()]
      .filter((item) => item.runId === runId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((item) => ({
        artifactId: item.artifactId,
        fileName: item.fileName,
        createdAt: item.createdAt,
        sizeBytes: item.sizeBytes,
      }));

    return {
      runId,
      items,
      nextCursor: null,
    };
  }

  public async getRunJsonArtifactIndexRecord(runId: string, artifactId: string) {
    return this.jsonArtifacts.get(`${runId}:${artifactId}`) ?? null;
  }

  public async getPipelineRunIds(pipelineId: string): Promise<string[]> {
    return [...this.runs.values()]
      .filter((run) => run.pipelineId === pipelineId)
      .map((run) => run.runId);
  }

  public async countUnsettledRunEvents(runIds: string[]): Promise<number> {
    if (runIds.length === 0) {
      return 0;
    }

    return [...this.events.values()].filter(
      (event) => runIds.includes(event.runId) && event.projectionStatus !== 'applied',
    ).length;
  }

  public async deletePipelineControlPlaneData(pipelineId: string, runIds: string[]): Promise<void> {
    this.pipelines.delete(pipelineId);
    for (const runId of runIds) {
      this.runs.delete(runId);
      this.manifests.delete(runId);
      for (const event of [...this.events.values()]) {
        if (event.runId === runId) {
          this.events.delete(event.eventId);
        }
      }
      for (const artifact of [...this.jsonArtifacts.values()]) {
        if (artifact.runId === runId) {
          this.jsonArtifacts.delete(`${artifact.runId}:${artifact.artifactId}`);
        }
      }
    }
  }

  public async getPipelineDeleteJob(pipelineId: string) {
    return this.deleteJobs.get(pipelineId) ?? null;
  }

  public async upsertPipelineDeleteJob(job: {
    _id: string;
    pipelineId: string;
    status: 'deleting' | 'deleted' | 'delete_failed';
    progress: { totalSteps: number; completedSteps: number };
    lastError?: { code: string; message: string };
    attempts: number;
    createdAt: string;
    updatedAt: string;
  }) {
    this.deleteJobs.set(job.pipelineId, job);
    return job;
  }
}

test('startPipelineRun dispatches ingestion first then crawler for crawl_and_ingest', async () => {
  const store = new InMemoryStore();
  store.pipelines.set(
    controlPlanePipelineV2Fixture.pipelineId,
    withStoredSinkSecret(controlPlanePipelineV2Fixture),
  );

  const calls: string[] = [];
  const workerClient = {
    async ensureCrawlerReady() {
      calls.push('ready:crawler');
    },
    async ensureIngestionReady() {
      calls.push('ready:ingestion');
    },
    async startIngestionRun(payload: { runId: string }) {
      calls.push(`ingestion:${payload.runId}`);
      return {
        ok: true as const,
        accepted: true as const,
        deduplicated: false as const,
        state: 'accepted' as const,
        workerType: 'ingestion' as const,
        runId: payload.runId,
        contractVersion: 'v2' as const,
      };
    },
    async startCrawlerRun(payload: { runId: string }) {
      calls.push(`crawler:${payload.runId}`);
      return {
        ok: true as const,
        accepted: true as const,
        deduplicated: false as const,
        state: 'accepted' as const,
        workerType: 'crawler' as const,
        runId: payload.runId,
        contractVersion: 'v2' as const,
      };
    },
    async cancelCrawlerRun() {
      return 'accepted' as const;
    },
    async cancelIngestionRun(_payload: { runId: string; reason: string }) {
      return 'accepted' as const;
    },
  };

  const logger = createLogger();
  const streamHub = new StreamHub(logger as never);
  const state = new ControlServiceState({
    serviceName: 'control-service-v2',
    serviceVersion: 'test',
    subscriptionEnabled: true,
  });
  const service = new ControlService(
    createEnv(),
    store,
    workerClient,
    state,
    streamHub,
    logger as never,
  );

  const response = await service.startPipelineRun(controlPlanePipelineV2Fixture.pipelineId);

  assert.equal(response.pipelineId, controlPlanePipelineV2Fixture.pipelineId);
  assert.equal(response.status, 'queued');
  assert.equal(calls.length, 4);
  assert.equal(calls[0], 'ready:crawler');
  assert.equal(calls[1], 'ready:ingestion');
  assert.equal(calls[2]?.startsWith('ingestion:'), true);
  assert.equal(calls[3]?.startsWith('crawler:'), true);

  const persistedRun = store.runs.get(response.runId);
  assert.ok(persistedRun);
  assert.equal(persistedRun?.status, 'queued');

  const persistedManifest = store.manifests.get(response.runId);
  assert.ok(persistedManifest);
  assert.equal(persistedManifest?.workerCommands.crawler.artifactSink.type, 'gcs');
  assert.equal(
    persistedManifest?.workerCommands.crawler.artifactSink.prefix,
    `runs/pipelines/${controlPlanePipelineV2Fixture.pipelineId}/artifacts/html`,
  );
});

test('createPipeline generates linkage IDs and keeps operator dbName', async () => {
  const store = new InMemoryStore();
  const logger = createLogger();
  const service = new ControlService(
    createEnv(),
    store,
    {
      async ensureCrawlerReady() {
        return undefined;
      },
      async ensureIngestionReady() {
        return undefined;
      },
      async startCrawlerRun() {
        throw new Error('not used');
      },
      async startIngestionRun() {
        throw new Error('not used');
      },
      async cancelCrawlerRun() {
        throw new Error('not used');
      },
      async cancelIngestionRun() {
        throw new Error('not used');
      },
    },
    new ControlServiceState({
      serviceName: 'control-service-v2',
      serviceVersion: 'test',
      subscriptionEnabled: true,
    }),
    new StreamHub(logger as never),
    logger as never,
  );

  const pipeline = await service.createPipeline({
    name: 'Vyvoj aplikaci a systemu',
    source: 'jobs.cz',
    mode: 'crawl_and_ingest',
    searchSpace: {
      name: 'Vyvoj aplikaci a systemu',
      description: 'Regression case for Mongo-safe db naming.',
      startUrls: ['https://example.com/jobs'],
      maxItems: 25,
      allowInactiveMarking: false,
    },
    runtimeProfile: {
      name: 'Vyvoj Runtime',
      crawlerMaxConcurrency: 3,
      crawlerMaxRequestsPerMinute: 60,
      ingestionConcurrency: 4,
    },
    structuredOutput: {
      destinations: [{ type: 'mongodb' }],
    },
    operatorSink: {
      mongodbUri: 'mongodb://localhost:27017',
      dbName: 'pl-vyvoj-aplikaci-a-systemu',
    },
  });

  assert.equal(pipeline.dbName, 'pl-vyvoj-aplikaci-a-systemu');
  assert.equal(pipeline.searchSpace.id.startsWith('ss-'), true);
  assert.equal(pipeline.runtimeProfile.id.startsWith('rp-'), true);
  assert.equal(Buffer.byteLength(pipeline.dbName, 'utf8') <= 38, true);
  assert.equal(pipeline.operatorSink.hasMongoUri, true);
  assert.equal(pipeline.operatorSink.mongodbUri, undefined);
});

test('updatePipeline applies dbName-only operatorSink updates while preserving stored URI', async () => {
  const store = new InMemoryStore();
  store.pipelines.set(
    controlPlanePipelineV2Fixture.pipelineId,
    withStoredSinkSecret(controlPlanePipelineV2Fixture),
  );

  const logger = createLogger();
  const service = new ControlService(
    createEnv(),
    store,
    {
      async ensureCrawlerReady() {
        return undefined;
      },
      async ensureIngestionReady() {
        return undefined;
      },
      async startCrawlerRun() {
        throw new Error('not used');
      },
      async startIngestionRun() {
        throw new Error('not used');
      },
      async cancelCrawlerRun() {
        throw new Error('not used');
      },
      async cancelIngestionRun() {
        throw new Error('not used');
      },
    },
    new ControlServiceState({
      serviceName: 'control-service-v2',
      serviceVersion: 'test',
      subscriptionEnabled: true,
    }),
    new StreamHub(logger as never),
    logger as never,
  );

  const updated = await service.updatePipeline(controlPlanePipelineV2Fixture.pipelineId, {
    operatorSink: {
      dbName: 'pl-vyvoj-hw-praha-02',
    },
  });

  assert.equal(updated.dbName, 'pl-vyvoj-hw-praha-02');
  assert.equal(updated.operatorSink.dbName, 'pl-vyvoj-hw-praha-02');
  assert.equal(updated.operatorSink.hasMongoUri, true);
  assert.equal(updated.operatorSink.mongodbUri, undefined);

  const stored = await store.getPipeline(controlPlanePipelineV2Fixture.pipelineId);
  assert.ok(stored);
  assert.equal(stored.dbName, 'pl-vyvoj-hw-praha-02');
  assert.equal(stored.operatorSink.dbName, 'pl-vyvoj-hw-praha-02');
  assert.equal(stored.operatorSink.mongodbUri, 'mongodb://localhost:27017');
});

test('startPipelineRun rejects stored pipelines with an overlong dbName', async () => {
  const store = new InMemoryStore();
  store.pipelines.set(controlPlanePipelineV2Fixture.pipelineId, {
    ...withStoredSinkSecret(controlPlanePipelineV2Fixture),
    dbName: 'pipeline-vyvoj-aplikaci-a-systemu-cee0eec9',
  });

  const logger = createLogger();
  const service = new ControlService(
    createEnv(),
    store,
    {
      async ensureCrawlerReady() {
        return undefined;
      },
      async ensureIngestionReady() {
        return undefined;
      },
      async startCrawlerRun() {
        throw new Error('not used');
      },
      async startIngestionRun() {
        throw new Error('not used');
      },
      async cancelCrawlerRun() {
        throw new Error('not used');
      },
      async cancelIngestionRun() {
        throw new Error('not used');
      },
    },
    new ControlServiceState({
      serviceName: 'control-service-v2',
      serviceVersion: 'test',
      subscriptionEnabled: true,
    }),
    new StreamHub(logger as never),
    logger as never,
  );

  await assert.rejects(
    () => service.startPipelineRun(controlPlanePipelineV2Fixture.pipelineId),
    /PIPELINE_INVALID_DB_NAME|MongoDB limit of 38 bytes/i,
  );
});

test('startPipelineRun marks run failed and cancels ingestion when crawler dispatch fails', async () => {
  const store = new InMemoryStore();
  store.pipelines.set(
    controlPlanePipelineV2Fixture.pipelineId,
    withStoredSinkSecret(controlPlanePipelineV2Fixture),
  );

  let cancelledRunId: string | null = null;
  let cancelReason: string | null = null;
  const workerClient = {
    async ensureCrawlerReady() {},
    async ensureIngestionReady() {},
    async startIngestionRun(payload: { runId: string }) {
      return {
        ok: true as const,
        accepted: true as const,
        deduplicated: false as const,
        state: 'accepted' as const,
        workerType: 'ingestion' as const,
        runId: payload.runId,
        contractVersion: 'v2' as const,
      };
    },
    async startCrawlerRun() {
      throw new WorkerClientError('Crawler worker unavailable.');
    },
    async cancelCrawlerRun() {
      return 'accepted' as const;
    },
    async cancelIngestionRun(payload: { runId: string; reason: string }) {
      cancelledRunId = payload.runId;
      cancelReason = payload.reason;
      return 'accepted' as const;
    },
  };

  const logger = createLogger();
  const streamHub = new StreamHub(logger as never);
  const state = new ControlServiceState({
    serviceName: 'control-service-v2',
    serviceVersion: 'test',
    subscriptionEnabled: true,
  });
  const service = new ControlService(
    createEnv(),
    store,
    workerClient,
    state,
    streamHub,
    logger as never,
  );

  await assert.rejects(
    () => service.startPipelineRun(controlPlanePipelineV2Fixture.pipelineId),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'CRAWLER_DISPATCH_FAILED');
      return true;
    },
  );

  const failedRun = [...store.runs.values()].at(0);
  assert.ok(failedRun);
  assert.equal(failedRun?.status, 'failed');
  assert.equal(failedRun?.stopReason, 'crawler_dispatch_failed');
  assert.equal(cancelledRunId, failedRun?.runId ?? null);
  assert.equal(cancelReason, 'startup_rollback');
});

test('startPipelineRun fails fast when required worker readiness check fails', async () => {
  const store = new InMemoryStore();
  store.pipelines.set(
    controlPlanePipelineV2Fixture.pipelineId,
    withStoredSinkSecret(controlPlanePipelineV2Fixture),
  );

  const workerClient = {
    async ensureCrawlerReady() {},
    async ensureIngestionReady() {
      throw new WorkerClientError('ingestion worker readiness check failed (503).');
    },
    async startIngestionRun() {
      throw new Error('should not be called');
    },
    async startCrawlerRun() {
      throw new Error('should not be called');
    },
    async cancelCrawlerRun() {
      return 'accepted' as const;
    },
    async cancelIngestionRun(_payload: { runId: string; reason: string }) {
      return 'accepted' as const;
    },
  };

  const logger = createLogger();
  const streamHub = new StreamHub(logger as never);
  const state = new ControlServiceState({
    serviceName: 'control-service-v2',
    serviceVersion: 'test',
    subscriptionEnabled: true,
  });
  const service = new ControlService(
    createEnv(),
    store,
    workerClient,
    state,
    streamHub,
    logger as never,
  );

  await assert.rejects(
    () => service.startPipelineRun(controlPlanePipelineV2Fixture.pipelineId),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'INGESTION_WORKER_UNAVAILABLE');
      return true;
    },
  );

  assert.equal(store.runs.size, 0);
  assert.equal(store.manifests.size, 0);
});

test('startPipelineRun marks run failed when startup rollback cancel fails', async () => {
  const store = new InMemoryStore();
  store.pipelines.set(
    controlPlanePipelineV2Fixture.pipelineId,
    withStoredSinkSecret(controlPlanePipelineV2Fixture),
  );

  const workerClient = {
    async ensureCrawlerReady() {},
    async ensureIngestionReady() {},
    async startIngestionRun(payload: { runId: string }) {
      return {
        ok: true as const,
        accepted: true as const,
        deduplicated: false as const,
        state: 'accepted' as const,
        workerType: 'ingestion' as const,
        runId: payload.runId,
        contractVersion: 'v2' as const,
      };
    },
    async startCrawlerRun() {
      throw new WorkerClientError('Crawler worker unavailable.');
    },
    async cancelCrawlerRun() {
      return 'accepted' as const;
    },
    async cancelIngestionRun(_payload: { runId: string; reason: string }) {
      throw new WorkerClientError('ingestion cancel request failed (500).');
    },
  };

  const logger = createLogger();
  const streamHub = new StreamHub(logger as never);
  const state = new ControlServiceState({
    serviceName: 'control-service-v2',
    serviceVersion: 'test',
    subscriptionEnabled: true,
  });
  const service = new ControlService(
    createEnv(),
    store,
    workerClient,
    state,
    streamHub,
    logger as never,
  );

  await assert.rejects(
    () => service.startPipelineRun(controlPlanePipelineV2Fixture.pipelineId),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'STARTUP_ROLLBACK_CANCEL_FAILED');
      return true;
    },
  );

  const failedRun = [...store.runs.values()].at(0);
  assert.ok(failedRun);
  assert.equal(failedRun?.status, 'failed');
  assert.equal(failedRun?.stopReason, 'startup_rollback_cancel_failed');
});
