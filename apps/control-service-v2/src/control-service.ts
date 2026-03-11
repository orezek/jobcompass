import {
  controlPlanePipelineV2Schema,
  controlServiceDeletePipelineAcceptedResponseV2Schema,
  controlServiceDeletePipelineStatusResponseV2Schema,
  controlServiceCancelRunAcceptedResponseV2Schema,
  controlServiceStartPipelineRunAcceptedResponseV2Schema,
  createControlPlanePipelineRequestV2Schema,
  getRunJsonArtifactResponseV2Schema,
  listControlPlanePipelinesQueryV2Schema,
  listControlPlaneRunEventsQueryV2Schema,
  listControlPlaneRunsQueryV2Schema,
  listRunJsonArtifactsQueryV2Schema,
  runtimeBrokerEventV2Schema,
  updateControlPlanePipelineRequestV2Schema,
} from '@repo/control-plane-contracts/v2';
import { Storage, type File } from '@google-cloud/storage';
import type { FastifyBaseLogger } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { MongoClient, MongoServerError } from 'mongodb';
import { z } from 'zod';
import type { EnvSchema } from './env.js';
import { ControlServiceError } from './errors.js';
import type { ControlPlaneStore, PipelineDeleteJobRecord } from './repository.js';
import {
  applyRuntimeEventToRun,
  assertPipelineCreateRequestConsistency,
  buildInitialRun,
  buildRunEventIndexRecord,
  buildRunManifest,
  generatePipelineId,
  generateRuntimeProfileId,
  generateRunId,
  generateSearchSpaceId,
  markRunDispatchFailed,
  type ControlPlaneArtifactSink,
} from './run-model.js';
import type { ControlServiceState } from './service-state.js';
import type { StreamHub } from './stream-hub.js';
import { createZipArchiveStream } from './zip.js';
import { WorkerClientError } from './worker-client.js';

const MONGO_DB_NAME_MAX_BYTES = 38;
const PIPELINE_DELETE_JOB_MAX_ATTEMPTS = 5;
const PIPELINE_DELETE_JOB_INITIAL_BACKOFF_MS = 1_000;
const PIPELINE_DELETE_JOB_MAX_BACKOFF_MS = 30_000;

export type ControlServiceWorkerClient = Pick<
  import('./worker-client.js').WorkerClient,
  | 'startCrawlerRun'
  | 'startIngestionRun'
  | 'cancelCrawlerRun'
  | 'cancelIngestionRun'
  | 'ensureCrawlerReady'
  | 'ensureIngestionReady'
>;

function isDuplicateKeyError(error: unknown): error is MongoServerError {
  return error instanceof MongoServerError && error.code === 11_000;
}

function nowIso(): string {
  return new Date().toISOString();
}

function assertPipelineDbNameIsMongoSafe(dbName: string): void {
  if (Buffer.byteLength(dbName, 'utf8') <= MONGO_DB_NAME_MAX_BYTES) {
    return;
  }

  throw new ControlServiceError({
    statusCode: 422,
    code: 'PIPELINE_INVALID_DB_NAME',
    message: `Pipeline dbName exceeds MongoDB limit of ${MONGO_DB_NAME_MAX_BYTES} bytes.`,
  });
}

function resolveArtifactSink(env: EnvSchema): ControlPlaneArtifactSink {
  if (env.CONTROL_PLANE_ARTIFACT_STORAGE_BACKEND === 'gcs') {
    return {
      type: 'gcs',
      bucket: env.CONTROL_PLANE_ARTIFACT_STORAGE_GCS_BUCKET!,
      prefix: env.CONTROL_PLANE_ARTIFACT_STORAGE_GCS_PREFIX,
    };
  }

  return {
    type: 'local_filesystem',
    basePath: env.CONTROL_PLANE_ARTIFACT_STORAGE_LOCAL_BASE_PATH,
  };
}

function stripPipelineSinkSecrets(pipeline: z.infer<typeof controlPlanePipelineV2Schema>) {
  return controlPlanePipelineV2Schema.parse({
    ...pipeline,
    operatorSink: {
      dbName: pipeline.operatorSink.dbName,
      hasMongoUri: Boolean(pipeline.operatorSink.mongodbUri),
    },
  });
}

function redactMongoUri(uri: string): string {
  try {
    const parsed = new URL(uri);
    if (parsed.username || parsed.password) {
      parsed.username = '***';
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '***';
  }
}

function isActiveRunStatus(status: string): boolean {
  return status === 'queued' || status === 'running';
}

function joinPathSegments(...parts: string[]): string {
  return parts
    .map((part) => part.replace(/^\/+/u, '').replace(/\/+$/u, ''))
    .filter((part) => part.length > 0)
    .join('/');
}

function buildJsonArtifactId(runId: string, storagePath: string): string {
  const digest = createHash('sha256').update(`${runId}|${storagePath}`).digest('hex').slice(0, 16);
  return `json-${digest}`;
}

export class ControlService {
  private readonly artifactSink: ControlPlaneArtifactSink;
  private readonly storageClient: Storage;

  public constructor(
    private readonly env: EnvSchema,
    private readonly store: ControlPlaneStore,
    private readonly workerClient: ControlServiceWorkerClient,
    private readonly state: ControlServiceState,
    private readonly streamHub: StreamHub,
    private readonly logger: FastifyBaseLogger,
  ) {
    this.artifactSink = resolveArtifactSink(env);
    this.storageClient = new Storage({ projectId: env.GCP_PROJECT_ID });
  }

  public async createPipeline(payload: unknown) {
    const request = createControlPlanePipelineRequestV2Schema.parse(payload);
    assertPipelineCreateRequestConsistency({
      mode: request.mode,
      runtimeProfile: request.runtimeProfile,
      searchSpace: request.searchSpace,
      structuredOutput: request.structuredOutput,
    });
    assertPipelineDbNameIsMongoSafe(request.operatorSink.dbName);

    const timestamp = nowIso();
    const pipelineId = generatePipelineId(request.name);
    const searchSpaceId = generateSearchSpaceId(request.searchSpace.name);
    const runtimeProfileId = generateRuntimeProfileId(request.runtimeProfile.name);
    const hasMongoDestination = request.structuredOutput.destinations.some(
      (destination) => destination.type === 'mongodb',
    );
    const pipeline = controlPlanePipelineV2Schema.parse({
      name: request.name,
      source: request.source,
      mode: request.mode,
      searchSpace: {
        id: searchSpaceId,
        ...request.searchSpace,
        allowInactiveMarking: hasMongoDestination
          ? request.searchSpace.allowInactiveMarking
          : false,
      },
      runtimeProfile: {
        id: runtimeProfileId,
        ...request.runtimeProfile,
      },
      structuredOutput: request.structuredOutput,
      operatorSink: {
        dbName: request.operatorSink.dbName,
        mongodbUri: request.operatorSink.mongodbUri,
        hasMongoUri: true,
      },
      pipelineId,
      dbName: request.operatorSink.dbName,
      version: 1,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    try {
      const created = await this.store.createPipeline(pipeline);
      return stripPipelineSinkSecrets(created);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ControlServiceError({
          statusCode: 409,
          code: 'PIPELINE_CONFLICT',
          message: 'Pipeline identity conflict while creating pipeline.',
        });
      }

      throw error;
    }
  }

  public async listPipelines(query: unknown) {
    const parsedQuery = listControlPlanePipelinesQueryV2Schema.parse(query);
    const response = await this.store.listPipelines(parsedQuery);
    return {
      ...response,
      items: response.items.map((pipeline) => stripPipelineSinkSecrets(pipeline)),
    };
  }

  public async getPipeline(pipelineId: string) {
    const pipeline = await this.store.getPipeline(pipelineId);
    if (!pipeline) {
      throw new ControlServiceError({
        statusCode: 404,
        code: 'PIPELINE_NOT_FOUND',
        message: `Pipeline "${pipelineId}" was not found.`,
      });
    }

    return stripPipelineSinkSecrets(pipeline);
  }

  public async updatePipeline(pipelineId: string, payload: unknown) {
    const request = updateControlPlanePipelineRequestV2Schema.parse(payload);
    const current = await this.store.getPipeline(pipelineId);
    if (!current) {
      throw new ControlServiceError({
        statusCode: 404,
        code: 'PIPELINE_NOT_FOUND',
        message: `Pipeline "${pipelineId}" was not found.`,
      });
    }

    const activeRun = await this.store.findActiveRunForPipeline(pipelineId);
    if (activeRun) {
      throw new ControlServiceError({
        statusCode: 409,
        code: 'PIPELINE_UPDATE_BLOCKED_ACTIVE_RUN',
        message: `Pipeline "${pipelineId}" cannot be edited while run "${activeRun.runId}" is active.`,
        details: {
          activeRunId: activeRun.runId,
          activeRunStatus: activeRun.status,
        },
      });
    }

    const nextMode = request.mode ?? current.mode;
    const nextStructuredOutput = request.structuredOutput ?? current.structuredOutput;
    const hasMongoDestination = nextStructuredOutput.destinations.some(
      (destination) => destination.type === 'mongodb',
    );
    const nextSearchSpace = {
      ...current.searchSpace,
      ...(request.searchSpace ?? {}),
      allowInactiveMarking: hasMongoDestination
        ? (request.searchSpace?.allowInactiveMarking ?? current.searchSpace.allowInactiveMarking)
        : false,
    };
    const nextRuntimeProfile = {
      ...current.runtimeProfile,
      ...(request.runtimeProfile ?? {}),
      ingestionConcurrency:
        nextMode === 'crawl_only'
          ? current.runtimeProfile.ingestionConcurrency
          : (request.runtimeProfile?.ingestionConcurrency ??
            current.runtimeProfile.ingestionConcurrency),
    };
    const nextOperatorSink = request.operatorSink
      ? {
          dbName: request.operatorSink.dbName ?? current.operatorSink.dbName,
          mongodbUri: request.operatorSink.mongodbUri ?? current.operatorSink.mongodbUri,
          hasMongoUri: true,
        }
      : current.operatorSink;

    assertPipelineCreateRequestConsistency({
      mode: nextMode,
      runtimeProfile: nextRuntimeProfile,
      searchSpace: nextSearchSpace,
      structuredOutput: nextStructuredOutput,
    });
    assertPipelineDbNameIsMongoSafe(nextOperatorSink.dbName);

    const updated = controlPlanePipelineV2Schema.parse({
      ...current,
      ...(request.name ? { name: request.name } : {}),
      mode: nextMode,
      searchSpace: nextSearchSpace,
      runtimeProfile: nextRuntimeProfile,
      structuredOutput: nextStructuredOutput,
      operatorSink: nextOperatorSink,
      dbName: nextOperatorSink.dbName,
      updatedAt: nowIso(),
    });

    const stored = await this.store.replacePipeline(updated);
    if (!stored) {
      throw new ControlServiceError({
        statusCode: 404,
        code: 'PIPELINE_NOT_FOUND',
        message: `Pipeline "${pipelineId}" was not found.`,
      });
    }

    return stripPipelineSinkSecrets(stored);
  }

  public async startPipelineRun(pipelineId: string) {
    const pipeline = await this.store.getPipeline(pipelineId);
    if (!pipeline) {
      throw new ControlServiceError({
        statusCode: 404,
        code: 'PIPELINE_NOT_FOUND',
        message: `Pipeline "${pipelineId}" was not found.`,
      });
    }

    assertPipelineDbNameIsMongoSafe(pipeline.dbName);

    const deleteJob = await this.store.getPipelineDeleteJob(pipelineId);
    if (deleteJob?.status === 'deleting') {
      throw new ControlServiceError({
        statusCode: 409,
        code: 'PIPELINE_DELETING',
        message: `Pipeline "${pipelineId}" is currently deleting and cannot start a run.`,
        details: {
          deleteJobId: deleteJob._id,
          status: deleteJob.status,
        },
      });
    }

    const activeRun = await this.store.findActiveRunForPipeline(pipelineId);
    if (activeRun && isActiveRunStatus(activeRun.status)) {
      throw new ControlServiceError({
        statusCode: 409,
        code: 'ACTIVE_RUN_EXISTS',
        message: `Pipeline "${pipelineId}" already has an active run.`,
        details: {
          activeRunId: activeRun.runId,
        },
      });
    }

    const runId = generateRunId();
    await this.preflightPipelineRunDependencies(pipeline, runId);

    const manifest = buildRunManifest({
      pipeline,
      runId,
      createdBy: this.env.SERVICE_NAME,
      artifactSink: this.artifactSink,
    });
    const run = buildInitialRun({ pipeline, runId });
    const redactedManifest = this.stripManifestSinkSecrets(manifest);

    await this.store.createRunAndManifest({ run, manifest: redactedManifest });
    this.streamHub.publishRunUpserted(run);

    try {
      if (manifest.workerCommands.ingestion) {
        await this.workerClient.startIngestionRun(manifest.workerCommands.ingestion);
      }
    } catch (error) {
      await this.failRunAfterDispatchError(run, 'ingestion_dispatch_failed');
      throw this.mapWorkerError('INGESTION_DISPATCH_FAILED', error);
    }

    try {
      await this.workerClient.startCrawlerRun(manifest.workerCommands.crawler);
    } catch (error) {
      if (manifest.workerCommands.ingestion) {
        try {
          await this.cancelIngestionAfterCrawlerDispatchFailure(runId);
        } catch (cancelError) {
          await this.failRunAfterDispatchError(run, 'startup_rollback_cancel_failed');
          throw this.mapWorkerError('STARTUP_ROLLBACK_CANCEL_FAILED', cancelError);
        }
      }

      await this.failRunAfterDispatchError(run, 'crawler_dispatch_failed');
      throw this.mapWorkerError('CRAWLER_DISPATCH_FAILED', error);
    }

    return controlServiceStartPipelineRunAcceptedResponseV2Schema.parse({
      ok: true,
      accepted: true,
      pipelineId,
      runId,
      status: 'queued',
      message: 'Run accepted for control-plane execution.',
    });
  }

  public async cancelRun(runId: string) {
    const run = await this.store.getRun(runId);
    if (!run) {
      throw new ControlServiceError({
        statusCode: 404,
        code: 'RUN_NOT_FOUND',
        message: `Run "${runId}" was not found.`,
      });
    }

    if (!['queued', 'running'].includes(run.status)) {
      return controlServiceCancelRunAcceptedResponseV2Schema.parse({
        ok: true,
        accepted: true,
        runId,
        message: 'Run is already terminal.',
      });
    }

    try {
      const crawlerResult = await this.workerClient.cancelCrawlerRun(runId);
      if (crawlerResult === 'not_found') {
        this.logger.warn({ runId }, 'Crawler worker did not find the run during cancel.');
      }

      if (run.ingestion.enabled) {
        const ingestionResult = await this.workerClient.cancelIngestionRun({
          runId,
          reason: 'operator_request',
          details: {
            requestedBy: 'operator',
            requestedAt: nowIso(),
            note: 'Cancellation requested via control-service run cancel endpoint.',
          },
        });
        if (ingestionResult === 'not_found') {
          this.logger.warn({ runId }, 'Ingestion worker did not find the run during cancel.');
        }
      }
    } catch (error) {
      throw this.mapWorkerError('RUN_CANCEL_FAILED', error);
    }

    return controlServiceCancelRunAcceptedResponseV2Schema.parse({
      ok: true,
      accepted: true,
      runId,
      message: 'Cancellation requested.',
    });
  }

  public async listRuns(query: unknown) {
    const parsedQuery = listControlPlaneRunsQueryV2Schema.parse(query);
    return this.store.listRuns(parsedQuery);
  }

  public async getRun(runId: string) {
    const run = await this.store.getRun(runId);
    if (!run) {
      throw new ControlServiceError({
        statusCode: 404,
        code: 'RUN_NOT_FOUND',
        message: `Run "${runId}" was not found.`,
      });
    }

    return run;
  }

  public async listRunEvents(runId: string, query: unknown) {
    const run = await this.store.getRun(runId);
    if (!run) {
      throw new ControlServiceError({
        statusCode: 404,
        code: 'RUN_NOT_FOUND',
        message: `Run "${runId}" was not found.`,
      });
    }

    const parsedQuery = listControlPlaneRunEventsQueryV2Schema.parse(query);
    return this.store.listRunEvents(runId, parsedQuery);
  }

  public async listRunJsonArtifacts(runId: string, query: unknown) {
    await this.assertRunExists(runId);
    const parsedQuery = listRunJsonArtifactsQueryV2Schema.parse(query);
    return this.store.listRunJsonArtifacts(runId, parsedQuery);
  }

  public async getRunJsonArtifact(runId: string, artifactId: string) {
    const artifact = await this.getRunJsonArtifactIndexRecordOrThrow(runId, artifactId);
    const raw = await this.readArtifactStoragePath(artifact.storagePath);
    const parsedPayload = JSON.parse(raw.toString('utf8')) as unknown;
    const payloadObject =
      parsedPayload !== null && typeof parsedPayload === 'object'
        ? (parsedPayload as Record<string, unknown>)
        : { value: parsedPayload };

    return getRunJsonArtifactResponseV2Schema.parse({
      artifactId: artifact.artifactId,
      fileName: artifact.fileName,
      payload: payloadObject,
    });
  }

  public async downloadRunJsonArtifact(
    runId: string,
    artifactId: string,
  ): Promise<{
    fileName: string;
    contentType: 'application/json';
    buffer: Buffer;
  }> {
    const artifact = await this.getRunJsonArtifactIndexRecordOrThrow(runId, artifactId);
    const raw = await this.readArtifactStoragePath(artifact.storagePath);
    return {
      fileName: artifact.fileName,
      contentType: 'application/json',
      buffer: raw,
    };
  }

  public async downloadAllRunJsonArtifacts(runId: string): Promise<{
    fileName: string;
    contentType: 'application/zip';
    stream: NodeJS.ReadableStream;
  }> {
    await this.assertRunExists(runId);
    const entries = await this.collectAllRunJsonArtifacts(runId);
    const timeoutAt = Date.now() + this.env.CONTROL_PLANE_JSON_BUNDLE_TIMEOUT_MS;
    const failedArtifactIds: string[] = [];
    let totalBytes = 0;

    const files: Array<{ name: string; content: Buffer }> = [];
    for (const entry of entries) {
      if (Date.now() > timeoutAt) {
        throw new ControlServiceError({
          statusCode: 504,
          code: 'ARTIFACT_BUNDLE_TIMEOUT',
          message: `JSON artifact bundle generation exceeded ${this.env.CONTROL_PLANE_JSON_BUNDLE_TIMEOUT_MS}ms.`,
        });
      }

      try {
        const raw = await this.readArtifactStoragePath(entry.storagePath);
        totalBytes += raw.byteLength;
        if (totalBytes > this.env.CONTROL_PLANE_JSON_BUNDLE_MAX_BYTES) {
          throw new ControlServiceError({
            statusCode: 413,
            code: 'ARTIFACT_BUNDLE_TOO_LARGE',
            message: `JSON artifact bundle exceeded ${this.env.CONTROL_PLANE_JSON_BUNDLE_MAX_BYTES} bytes.`,
            details: {
              maxBytes: this.env.CONTROL_PLANE_JSON_BUNDLE_MAX_BYTES,
            },
          });
        }

        files.push({
          name: entry.fileName,
          content: raw,
        });
      } catch (error) {
        if (error instanceof ControlServiceError) {
          throw error;
        }
        failedArtifactIds.push(entry.artifactId);
      }
    }

    if (failedArtifactIds.length > 0) {
      throw new ControlServiceError({
        statusCode: 502,
        code: 'ARTIFACT_BUNDLE_PARTIAL_FAILURE',
        message: 'One or more JSON artifacts could not be read for bundle download.',
        details: {
          failedArtifactIds,
        },
      });
    }

    return {
      fileName: `${runId}-json-artifacts.zip`,
      contentType: 'application/zip',
      stream: createZipArchiveStream(files),
    };
  }

  public async deletePipeline(pipelineId: string) {
    const pipeline = await this.store.getPipeline(pipelineId);
    if (!pipeline) {
      throw new ControlServiceError({
        statusCode: 404,
        code: 'PIPELINE_NOT_FOUND',
        message: `Pipeline "${pipelineId}" was not found.`,
      });
    }

    const activeRun = await this.store.findActiveRunForPipeline(pipelineId);
    if (activeRun && isActiveRunStatus(activeRun.status)) {
      throw new ControlServiceError({
        statusCode: 409,
        code: 'PIPELINE_DELETE_BLOCKED',
        message: `Pipeline "${pipelineId}" cannot be deleted while run "${activeRun.runId}" is active.`,
        details: {
          activeRunIds: [activeRun.runId],
          activeRunStatus: activeRun.status,
        },
      });
    }

    const runIds = await this.store.getPipelineRunIds(pipelineId);
    const unsettledEvents = await this.store.countUnsettledRunEvents(runIds);
    if (unsettledEvents > 0) {
      throw new ControlServiceError({
        statusCode: 409,
        code: 'PIPELINE_DELETE_BLOCKED',
        message: `Pipeline "${pipelineId}" cannot be deleted until all runtime events are settled.`,
        details: {
          unsettledEvents,
        },
      });
    }

    const existingJob = await this.store.getPipelineDeleteJob(pipelineId);
    if (existingJob && existingJob.status === 'deleting') {
      return controlServiceDeletePipelineAcceptedResponseV2Schema.parse({
        ok: true,
        accepted: true,
        pipelineId,
        deleteJobId: existingJob._id,
        status: 'deleting',
      });
    }

    const now = nowIso();
    const deleteJob: PipelineDeleteJobRecord = {
      _id: existingJob?._id ?? `delete-${randomUUID()}`,
      pipelineId,
      status: 'deleting',
      progress: {
        totalSteps: 5,
        completedSteps: 0,
      },
      attempts: 0,
      createdAt: existingJob?.createdAt ?? now,
      updatedAt: now,
    };
    const persistedJob = await this.store.upsertPipelineDeleteJob(deleteJob);

    void this.executeDeleteJob({
      pipeline,
      runIds,
      deleteJobId: persistedJob._id,
    });

    return controlServiceDeletePipelineAcceptedResponseV2Schema.parse({
      ok: true,
      accepted: true,
      pipelineId,
      deleteJobId: persistedJob._id,
      status: 'deleting',
    });
  }

  public async getPipelineDeleteStatus(pipelineId: string) {
    const job = await this.store.getPipelineDeleteJob(pipelineId);
    if (!job) {
      throw new ControlServiceError({
        statusCode: 404,
        code: 'PIPELINE_DELETE_STATUS_NOT_FOUND',
        message: `Delete status for pipeline "${pipelineId}" was not found.`,
      });
    }

    return controlServiceDeletePipelineStatusResponseV2Schema.parse({
      ok: true,
      pipelineId,
      deleteJobId: job._id,
      status: job.status,
      progress: job.progress,
      ...(job.lastError ? { lastError: job.lastError } : {}),
    });
  }

  public async handlePubSubMessage(rawMessage: string): Promise<{
    disposition: 'applied' | 'orphaned' | 'duplicate' | 'invalid';
    eventId?: string;
    runId?: string;
  }> {
    this.state.recordMessageReceived(nowIso());

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawMessage) as unknown;
    } catch (error) {
      this.state.recordError(nowIso());
      this.logger.warn({ err: error }, 'Skipping malformed Pub/Sub message payload.');
      return { disposition: 'invalid' };
    }

    const parsedEvent = runtimeBrokerEventV2Schema.safeParse(parsedJson);
    if (!parsedEvent.success) {
      this.state.recordError(nowIso());
      this.logger.warn(
        { issues: parsedEvent.error.issues },
        'Skipping invalid runtime Pub/Sub event.',
      );
      return { disposition: 'invalid' };
    }

    const runtimeEvent = parsedEvent.data;
    const indexedEvent = buildRunEventIndexRecord(runtimeEvent);

    try {
      const result = await this.store.withTransaction(async (session) => {
        await this.store.insertRunEvent(indexedEvent, session);

        const run = await this.store.getRun(runtimeEvent.runId, session);
        if (!run) {
          await this.store.updateRunEventProjectionStatus(
            runtimeEvent.eventId,
            'orphaned',
            session,
          );
          return {
            disposition: 'orphaned' as const,
            event: {
              ...indexedEvent,
              projectionStatus: 'orphaned' as const,
            },
            run: null,
          };
        }

        const nextRun = applyRuntimeEventToRun(run, runtimeEvent);
        await this.store.replaceRun(nextRun, session);
        if (
          runtimeEvent.eventType === 'ingestion.item.succeeded' &&
          runtimeEvent.payload.outputRef?.downloadableJsonPath
        ) {
          const storagePath = runtimeEvent.payload.outputRef.downloadableJsonPath;
          const fileName =
            path.posix.basename(storagePath) || `${runtimeEvent.payload.sourceId}.json`;
          await this.store.upsertRunJsonArtifactIndexRecord(
            {
              artifactId: buildJsonArtifactId(runtimeEvent.runId, storagePath),
              runId: runtimeEvent.runId,
              pipelineId: run.pipelineId,
              fileName,
              storagePath,
              sizeBytes: runtimeEvent.payload.outputRef.downloadableJsonSizeBytes ?? 0,
              createdAt: runtimeEvent.occurredAt,
            },
            session,
          );
        }
        return {
          disposition: 'applied' as const,
          event: indexedEvent,
          run: nextRun,
        };
      });

      this.state.recordMessageApplied(nowIso());
      this.streamHub.publishRunEventAppended(result.event, result.run?.pipelineId);
      if (result.run) {
        this.streamHub.publishRunUpserted(result.run);
      }

      return {
        disposition: result.disposition,
        eventId: runtimeEvent.eventId,
        runId: runtimeEvent.runId,
      };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        this.logger.debug(
          {
            eventId: runtimeEvent.eventId,
            runId: runtimeEvent.runId,
          },
          'Ignoring duplicate runtime Pub/Sub event.',
        );
        this.state.recordMessageApplied(nowIso());
        return {
          disposition: 'duplicate',
          eventId: runtimeEvent.eventId,
          runId: runtimeEvent.runId,
        };
      }

      this.state.recordError(nowIso());
      throw error;
    }
  }

  private async assertRunExists(runId: string): Promise<void> {
    const run = await this.store.getRun(runId);
    if (!run) {
      throw new ControlServiceError({
        statusCode: 404,
        code: 'RUN_NOT_FOUND',
        message: `Run "${runId}" was not found.`,
      });
    }
  }

  private async getRunJsonArtifactIndexRecordOrThrow(runId: string, artifactId: string) {
    await this.assertRunExists(runId);
    const artifact = await this.store.getRunJsonArtifactIndexRecord(runId, artifactId);
    if (!artifact) {
      throw new ControlServiceError({
        statusCode: 404,
        code: 'RUN_JSON_ARTIFACT_NOT_FOUND',
        message: `JSON artifact "${artifactId}" for run "${runId}" was not found.`,
      });
    }
    return artifact;
  }

  private async collectAllRunJsonArtifacts(runId: string) {
    const all: Array<{
      artifactId: string;
      fileName: string;
      storagePath: string;
      sizeBytes: number;
      createdAt: string;
      runId: string;
      pipelineId: string;
    }> = [];

    let cursor: string | null = null;
    while (true) {
      const page = await this.store.listRunJsonArtifacts(runId, {
        limit: 200,
        cursor: cursor ?? undefined,
        sortBy: 'createdAt',
        sortDir: 'desc',
      });

      for (const item of page.items) {
        const full = await this.store.getRunJsonArtifactIndexRecord(runId, item.artifactId);
        if (full) {
          all.push(full);
        }
      }

      if (!page.nextCursor) {
        break;
      }
      cursor = page.nextCursor;
    }

    return all;
  }

  private async readArtifactStoragePath(storagePath: string): Promise<Buffer> {
    if (storagePath.startsWith('gs://')) {
      const [bucket, ...pathParts] = storagePath.slice('gs://'.length).split('/');
      const objectPath = pathParts.join('/');
      const [buffer] = await this.storageClient
        .bucket(bucket ?? '')
        .file(objectPath)
        .download();
      return buffer;
    }

    return readFile(path.resolve(storagePath));
  }

  private stripManifestSinkSecrets(manifest: ReturnType<typeof buildRunManifest>) {
    return {
      ...manifest,
      pipelineSnapshot: stripPipelineSinkSecrets(manifest.pipelineSnapshot),
      workerCommands: {
        ...manifest.workerCommands,
        crawler: {
          ...manifest.workerCommands.crawler,
          persistenceTargets: {
            ...manifest.workerCommands.crawler.persistenceTargets,
            mongodbUri: redactMongoUri(
              manifest.workerCommands.crawler.persistenceTargets.mongodbUri,
            ),
          },
        },
        ...(manifest.workerCommands.ingestion
          ? {
              ingestion: {
                ...manifest.workerCommands.ingestion,
                persistenceTargets: {
                  ...manifest.workerCommands.ingestion.persistenceTargets,
                  mongodbUri: redactMongoUri(
                    manifest.workerCommands.ingestion.persistenceTargets.mongodbUri,
                  ),
                },
              },
            }
          : {}),
      },
    };
  }

  private async preflightPipelineRunDependencies(
    pipeline: z.infer<typeof controlPlanePipelineV2Schema>,
    runId: string,
  ): Promise<void> {
    await this.ensureWorkerDependenciesReady(pipeline.mode);
    if (this.env.CONTROL_PLANE_SKIP_SINK_PREFLIGHT) {
      return;
    }
    await this.preflightMongoSink(pipeline);
    await this.preflightArtifactSink(pipeline.pipelineId, runId);
  }

  private async preflightMongoSink(
    pipeline: z.infer<typeof controlPlanePipelineV2Schema>,
  ): Promise<void> {
    const rawUri = pipeline.operatorSink.mongodbUri?.trim();
    if (!rawUri) {
      throw new ControlServiceError({
        statusCode: 422,
        code: 'MONGODB_SINK_UNREACHABLE',
        message: `Pipeline "${pipeline.pipelineId}" is missing operatorSink.mongodbUri.`,
      });
    }

    const client = new MongoClient(rawUri, {
      maxPoolSize: 1,
      maxConnecting: 1,
      waitQueueTimeoutMS: 3_000,
    });

    try {
      await client.connect();
      await client.db(pipeline.operatorSink.dbName).command({ ping: 1 });
    } catch (error) {
      throw new ControlServiceError({
        statusCode: 502,
        code: 'MONGODB_SINK_UNREACHABLE',
        message: 'Operator MongoDB sink is unreachable for run dispatch preflight.',
        details: {
          pipelineId: pipeline.pipelineId,
          dbName: pipeline.operatorSink.dbName,
          mongodbUri: redactMongoUri(rawUri),
          reason: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  private async preflightArtifactSink(pipelineId: string, runId: string): Promise<void> {
    if (this.artifactSink.type === 'local_filesystem') {
      return;
    }

    const prefix = joinPathSegments(
      this.artifactSink.prefix,
      'pipelines',
      pipelineId,
      'runs',
      runId,
      'preflight',
    );
    const objectPath = joinPathSegments(prefix, `control-service-${Date.now()}.json`);
    const bucket = this.artifactSink.bucket;

    try {
      await this.storageClient.bucket(bucket).getMetadata();
      await this.storageClient
        .bucket(bucket)
        .file(objectPath)
        .save(JSON.stringify({ ok: true, type: 'artifact_preflight', at: nowIso() }), {
          resumable: false,
          contentType: 'application/json; charset=utf-8',
        });
      await this.storageClient.bucket(bucket).file(objectPath).delete({ ignoreNotFound: true });
    } catch (error) {
      throw new ControlServiceError({
        statusCode: 502,
        code: 'ARTIFACT_SINK_UNREACHABLE',
        message: 'Artifact sink preflight failed before worker dispatch.',
        details: {
          backend: this.artifactSink.type,
          bucket,
          prefix,
          operation: 'write',
          reason: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private async executeDeleteJob(input: {
    pipeline: z.infer<typeof controlPlanePipelineV2Schema>;
    runIds: string[];
    deleteJobId: string;
  }): Promise<void> {
    let attempts = 0;
    while (attempts < PIPELINE_DELETE_JOB_MAX_ATTEMPTS) {
      attempts += 1;

      try {
        await this.store.upsertPipelineDeleteJob({
          _id: input.deleteJobId,
          pipelineId: input.pipeline.pipelineId,
          status: 'deleting',
          progress: { totalSteps: 5, completedSteps: 0 },
          attempts,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        await this.store.deletePipelineControlPlaneData(input.pipeline.pipelineId, input.runIds);
        await this.store.upsertPipelineDeleteJob({
          _id: input.deleteJobId,
          pipelineId: input.pipeline.pipelineId,
          status: 'deleting',
          progress: { totalSteps: 5, completedSteps: 2 },
          attempts,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        await this.purgeOperatorSinkData(input.pipeline, input.runIds);
        await this.store.upsertPipelineDeleteJob({
          _id: input.deleteJobId,
          pipelineId: input.pipeline.pipelineId,
          status: 'deleting',
          progress: { totalSteps: 5, completedSteps: 3 },
          attempts,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        await this.purgeArtifactPrefix(input.pipeline.pipelineId);
        await this.store.upsertPipelineDeleteJob({
          _id: input.deleteJobId,
          pipelineId: input.pipeline.pipelineId,
          status: 'deleted',
          progress: { totalSteps: 5, completedSteps: 5 },
          attempts,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
        return;
      } catch (error) {
        const canRetry = attempts < PIPELINE_DELETE_JOB_MAX_ATTEMPTS;
        await this.store.upsertPipelineDeleteJob({
          _id: input.deleteJobId,
          pipelineId: input.pipeline.pipelineId,
          status: canRetry ? 'deleting' : 'delete_failed',
          progress: { totalSteps: 5, completedSteps: 0 },
          lastError: {
            code: 'PIPELINE_DELETE_FAILED',
            message: error instanceof Error ? error.message : String(error),
          },
          attempts,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });

        if (!canRetry) {
          this.logger.error(
            {
              err: error,
              pipelineId: input.pipeline.pipelineId,
              deleteJobId: input.deleteJobId,
            },
            'Pipeline delete job failed after retries.',
          );
          return;
        }

        const backoff = Math.min(
          PIPELINE_DELETE_JOB_INITIAL_BACKOFF_MS * 2 ** (attempts - 1),
          PIPELINE_DELETE_JOB_MAX_BACKOFF_MS,
        );
        await this.sleep(backoff);
      }
    }
  }

  private async purgeOperatorSinkData(
    pipeline: z.infer<typeof controlPlanePipelineV2Schema>,
    runIds: string[],
  ): Promise<void> {
    const rawUri = pipeline.operatorSink.mongodbUri?.trim();
    if (!rawUri) {
      return;
    }

    const client = new MongoClient(rawUri, {
      maxPoolSize: 2,
      maxConnecting: 1,
      waitQueueTimeoutMS: 5_000,
    });

    try {
      await client.connect();
      const db = client.db(pipeline.operatorSink.dbName);
      if (runIds.length > 0) {
        await db.collection('crawl_run_summaries').deleteMany({
          crawlRunId: { $in: runIds },
        });
        await db.collection('ingestion_run_summaries').deleteMany({
          runId: { $in: runIds },
        });
      }
      await db.collection('normalized_jobs').deleteMany({
        searchSpaceId: pipeline.searchSpace.id,
        source: pipeline.source,
      });
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  private async purgeArtifactPrefix(pipelineId: string): Promise<void> {
    if (this.artifactSink.type === 'local_filesystem') {
      const pipelinePath = path.resolve(this.artifactSink.basePath, 'pipelines', pipelineId);
      await rm(pipelinePath, { recursive: true, force: true });
      return;
    }

    const prefix = joinPathSegments(this.artifactSink.prefix, 'pipelines', pipelineId);
    const [files] = await this.storageClient.bucket(this.artifactSink.bucket).getFiles({ prefix });
    await Promise.all(files.map((file: File) => file.delete({ ignoreNotFound: true })));
  }

  private sleep(delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }

  private async failRunAfterDispatchError(
    run: Parameters<typeof markRunDispatchFailed>[0],
    stopReason: Parameters<typeof markRunDispatchFailed>[1],
  ): Promise<void> {
    const failedRun = markRunDispatchFailed(run, stopReason);
    await this.store.replaceRun(failedRun);
    this.streamHub.publishRunUpserted(failedRun);
  }

  private mapWorkerError(code: string, error: unknown): ControlServiceError {
    if (error instanceof WorkerClientError) {
      if (error.workerCode === 'MONGODB_SINK_CAPACITY_EXCEEDED') {
        return new ControlServiceError({
          statusCode: 429,
          code: 'MONGODB_SINK_CAPACITY_EXCEEDED',
          message: error.message,
        });
      }

      return new ControlServiceError({
        statusCode: 502,
        code,
        message: error.message,
      });
    }

    return new ControlServiceError({
      statusCode: 502,
      code,
      message: 'Worker request failed.',
    });
  }

  private async ensureWorkerDependenciesReady(
    mode: 'crawl_only' | 'crawl_and_ingest',
  ): Promise<void> {
    try {
      await this.workerClient.ensureCrawlerReady();
    } catch (error) {
      throw this.mapWorkerDependencyError('CRAWLER_WORKER_UNAVAILABLE', 'crawler', error);
    }

    if (mode !== 'crawl_and_ingest') {
      return;
    }

    try {
      await this.workerClient.ensureIngestionReady();
    } catch (error) {
      throw this.mapWorkerDependencyError('INGESTION_WORKER_UNAVAILABLE', 'ingestion', error);
    }
  }

  private async cancelIngestionAfterCrawlerDispatchFailure(runId: string): Promise<void> {
    const retryCount = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= retryCount; attempt += 1) {
      try {
        const result = await this.workerClient.cancelIngestionRun({
          runId,
          reason: 'startup_rollback',
          details: {
            failedWorker: 'crawler',
            failedAction: 'start_run',
            errorCode: 'CRAWLER_DISPATCH_FAILED',
            errorMessage: 'Crawler worker StartRun failed after ingestion StartRun accepted.',
          },
        });
        if (result === 'not_found') {
          this.logger.warn(
            { runId, attempt, retryCount },
            'Ingestion worker did not find run during startup rollback cancel.',
          );
        }
        return;
      } catch (error) {
        lastError = error;
        this.logger.warn(
          {
            err: error,
            runId,
            attempt,
            retryCount,
          },
          'Ingestion startup rollback cancel attempt failed.',
        );
      }
    }

    throw lastError ?? new Error('Ingestion startup rollback cancel failed.');
  }

  private mapWorkerDependencyError(
    code: string,
    worker: 'crawler' | 'ingestion',
    error: unknown,
  ): ControlServiceError {
    const details =
      error instanceof Error
        ? {
            worker,
            reason: error.message,
          }
        : { worker };

    return new ControlServiceError({
      statusCode: 503,
      code,
      message: `${worker} worker is not ready to accept StartRun.`,
      details,
    });
  }
}
