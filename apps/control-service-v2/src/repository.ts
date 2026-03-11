import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { Collection, type ClientSession, Db, type Filter, MongoClient, type Sort } from 'mongodb';
import {
  jsonArtifactIndexItemV2Schema,
  listRunJsonArtifactsQueryV2Schema,
  listRunJsonArtifactsResponseV2Schema,
  listControlPlanePipelinesQueryV2Schema,
  listControlPlanePipelinesResponseV2Schema,
  listControlPlaneRunEventsQueryV2Schema,
  listControlPlaneRunEventsResponseV2Schema,
  listControlPlaneRunsQueryV2Schema,
  listControlPlaneRunsResponseV2Schema,
  pipelineDeleteJobStatusV2Schema,
} from '@repo/control-plane-contracts/v2';
import type {
  ControlPlanePipeline,
  ControlPlaneRun,
  ControlPlaneRunEventIndex,
  ControlPlaneRunManifest,
} from './run-model.js';

type PipelineDocument = ControlPlanePipeline & { _id: string };
type RunDocument = ControlPlaneRun & { _id: string };
type RunManifestDocument = ControlPlaneRunManifest & { _id: string };
type RunEventDocument = ControlPlaneRunEventIndex & { _id: string };
type RunJsonArtifactIndexDocument = z.infer<typeof jsonArtifactIndexItemV2Schema> & { _id: string };
export type PipelineDeleteJobRecord = {
  _id: string;
  pipelineId: string;
  status: z.infer<typeof pipelineDeleteJobStatusV2Schema>;
  progress: {
    totalSteps: number;
    completedSteps: number;
  };
  lastError?: {
    code: string;
    message: string;
  };
  attempts: number;
  createdAt: string;
  updatedAt: string;
};
type PipelineDeleteJobDocument = PipelineDeleteJobRecord;

const PIPELINE_DELETE_JOB_TOTAL_STEPS = 5;

function stripMongoId<T extends { _id: string }>(value: T | null): Omit<T, '_id'> | null {
  if (!value) {
    return null;
  }

  const { _id: _unused, ...rest } = value;
  return rest;
}

function encodeCursor(value: object): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCursor<T>(cursor: string | undefined, schema: z.ZodType<T>): T | null {
  if (!cursor) {
    return null;
  }

  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  return schema.parse(JSON.parse(decoded) as unknown);
}

export type ControlPlaneStore = {
  ensureIndexes: () => Promise<void>;
  withTransaction: <T>(fn: (session: ClientSession) => Promise<T>) => Promise<T>;
  createPipeline: (pipeline: ControlPlanePipeline) => Promise<ControlPlanePipeline>;
  getPipeline: (
    pipelineId: string,
    session?: ClientSession,
  ) => Promise<ControlPlanePipeline | null>;
  replacePipeline: (pipeline: ControlPlanePipeline) => Promise<ControlPlanePipeline | null>;
  listPipelines: (
    query: z.infer<typeof listControlPlanePipelinesQueryV2Schema>,
  ) => Promise<z.infer<typeof listControlPlanePipelinesResponseV2Schema>>;
  createRunAndManifest: (input: {
    run: ControlPlaneRun;
    manifest: ControlPlaneRunManifest;
  }) => Promise<void>;
  getRun: (runId: string, session?: ClientSession) => Promise<ControlPlaneRun | null>;
  getRunManifest: (
    runId: string,
    session?: ClientSession,
  ) => Promise<ControlPlaneRunManifest | null>;
  replaceRun: (run: ControlPlaneRun, session?: ClientSession) => Promise<ControlPlaneRun>;
  insertRunEvent: (
    event: ControlPlaneRunEventIndex,
    session?: ClientSession,
  ) => Promise<ControlPlaneRunEventIndex>;
  updateRunEventProjectionStatus: (
    eventId: string,
    projectionStatus: 'applied' | 'orphaned',
    session?: ClientSession,
  ) => Promise<void>;
  findActiveRunForPipeline: (pipelineId: string) => Promise<ControlPlaneRun | null>;
  listRuns: (
    query: z.infer<typeof listControlPlaneRunsQueryV2Schema>,
  ) => Promise<z.infer<typeof listControlPlaneRunsResponseV2Schema>>;
  listRunEvents: (
    runId: string,
    query: z.infer<typeof listControlPlaneRunEventsQueryV2Schema>,
  ) => Promise<z.infer<typeof listControlPlaneRunEventsResponseV2Schema>>;
  upsertRunJsonArtifactIndexRecord: (
    item: z.infer<typeof jsonArtifactIndexItemV2Schema>,
    session?: ClientSession,
  ) => Promise<z.infer<typeof jsonArtifactIndexItemV2Schema>>;
  listRunJsonArtifacts: (
    runId: string,
    query: z.infer<typeof listRunJsonArtifactsQueryV2Schema>,
  ) => Promise<z.infer<typeof listRunJsonArtifactsResponseV2Schema>>;
  getRunJsonArtifactIndexRecord: (
    runId: string,
    artifactId: string,
  ) => Promise<z.infer<typeof jsonArtifactIndexItemV2Schema> | null>;
  getPipelineRunIds: (pipelineId: string) => Promise<string[]>;
  countUnsettledRunEvents: (runIds: string[]) => Promise<number>;
  deletePipelineControlPlaneData: (pipelineId: string, runIds: string[]) => Promise<void>;
  getPipelineDeleteJob: (pipelineId: string) => Promise<PipelineDeleteJobRecord | null>;
  upsertPipelineDeleteJob: (job: PipelineDeleteJobRecord) => Promise<PipelineDeleteJobRecord>;
};

export class ControlPlaneRepository {
  private readonly db: Db;
  private readonly pipelines: Collection<PipelineDocument>;
  private readonly runs: Collection<RunDocument>;
  private readonly runManifests: Collection<RunManifestDocument>;
  private readonly runEvents: Collection<RunEventDocument>;
  private readonly runJsonArtifacts: Collection<RunJsonArtifactIndexDocument>;
  private readonly pipelineDeleteJobs: Collection<PipelineDeleteJobDocument>;

  public constructor(
    private readonly mongoClient: MongoClient,
    dbName: string,
  ) {
    this.db = mongoClient.db(dbName);
    this.pipelines = this.db.collection<PipelineDocument>('control_plane_pipelines');
    this.runs = this.db.collection<RunDocument>('control_plane_runs');
    this.runManifests = this.db.collection<RunManifestDocument>('control_plane_run_manifests');
    this.runEvents = this.db.collection<RunEventDocument>('control_plane_run_event_index');
    this.runJsonArtifacts = this.db.collection<RunJsonArtifactIndexDocument>(
      'control_plane_run_json_artifacts',
    );
    this.pipelineDeleteJobs = this.db.collection<PipelineDeleteJobDocument>(
      'control_plane_pipeline_delete_jobs',
    );
  }

  public async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.pipelines.createIndexes([
        { key: { pipelineId: 1 }, unique: true, name: 'pipeline_id_unique' },
        { key: { dbName: 1 }, unique: true, name: 'pipeline_db_name_unique' },
        { key: { status: 1, updatedAt: -1 }, name: 'pipeline_status_updated_at' },
      ]),
      this.runManifests.createIndexes([{ key: { runId: 1 }, unique: true, name: 'run_id_unique' }]),
      this.runs.createIndexes([
        { key: { runId: 1 }, unique: true, name: 'run_id_unique' },
        { key: { pipelineId: 1, requestedAt: -1 }, name: 'pipeline_requested_at' },
        { key: { status: 1, requestedAt: -1 }, name: 'status_requested_at' },
      ]),
      this.runEvents.createIndexes([
        { key: { eventId: 1 }, unique: true, name: 'event_id_unique' },
        { key: { runId: 1, occurredAt: 1 }, name: 'run_occurred_at' },
      ]),
      this.runJsonArtifacts.createIndexes([
        { key: { runId: 1, artifactId: 1 }, unique: true, name: 'run_id_artifact_id_unique' },
        { key: { runId: 1, storagePath: 1 }, unique: true, name: 'run_id_storage_path_unique' },
        { key: { runId: 1, createdAt: -1, artifactId: -1 }, name: 'run_created_at_desc' },
        { key: { runId: 1, fileName: 1, artifactId: 1 }, name: 'run_file_name_asc' },
      ]),
      this.pipelineDeleteJobs.createIndexes([
        { key: { pipelineId: 1 }, unique: true, name: 'pipeline_id_unique' },
        { key: { status: 1, updatedAt: -1 }, name: 'status_updated_at' },
      ]),
    ]);
  }

  public async withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = this.mongoClient.startSession();

    try {
      return (await session.withTransaction(async () => fn(session))) as T;
    } finally {
      await session.endSession();
    }
  }

  public async createPipeline(pipeline: ControlPlanePipeline): Promise<ControlPlanePipeline> {
    await this.pipelines.insertOne({ _id: pipeline.pipelineId, ...pipeline });
    return pipeline;
  }

  public async getPipeline(
    pipelineId: string,
    session?: ClientSession,
  ): Promise<ControlPlanePipeline | null> {
    const doc = await this.pipelines.findOne({ _id: pipelineId }, { session });
    return stripMongoId(doc as PipelineDocument | null);
  }

  public async replacePipeline(
    pipeline: ControlPlanePipeline,
  ): Promise<ControlPlanePipeline | null> {
    const result = await this.pipelines.findOneAndUpdate(
      { _id: pipeline.pipelineId },
      {
        $set: {
          ...pipeline,
        },
      },
      {
        returnDocument: 'after',
      },
    );

    return stripMongoId(result as PipelineDocument | null);
  }

  public async listPipelines(
    query: z.infer<typeof listControlPlanePipelinesQueryV2Schema>,
  ): Promise<z.infer<typeof listControlPlanePipelinesResponseV2Schema>> {
    const cursor = decodeCursor(
      query.cursor,
      z.object({ updatedAt: z.string(), pipelineId: z.string() }).strict(),
    );
    const clauses: Record<string, unknown>[] = [];

    if (cursor) {
      clauses.push({
        $or: [
          { updatedAt: { $lt: cursor.updatedAt } },
          { updatedAt: cursor.updatedAt, pipelineId: { $lt: cursor.pipelineId } },
        ],
      });
    }

    const filter: Filter<PipelineDocument> =
      clauses.length === 0
        ? {}
        : clauses.length === 1
          ? (clauses[0] as Filter<PipelineDocument>)
          : ({ $and: clauses } as Filter<PipelineDocument>);
    const sort: Sort = { updatedAt: -1, pipelineId: -1 };
    const docs = await this.pipelines
      .find(filter)
      .sort(sort)
      .limit(query.limit + 1)
      .toArray();
    const hasNext = docs.length > query.limit;
    const page = docs.slice(0, query.limit).map((doc) => stripMongoId(doc) as ControlPlanePipeline);
    const nextCursor =
      hasNext && page.length > 0
        ? encodeCursor({
            updatedAt: page.at(-1)?.updatedAt,
            pipelineId: page.at(-1)?.pipelineId,
          })
        : null;

    return listControlPlanePipelinesResponseV2Schema.parse({
      items: page,
      nextCursor,
    });
  }

  public async createRunAndManifest(input: {
    run: ControlPlaneRun;
    manifest: ControlPlaneRunManifest;
  }): Promise<void> {
    await this.withTransaction(async (session) => {
      await this.runs.insertOne({ _id: input.run.runId, ...input.run }, { session });
      await this.runManifests.insertOne(
        { _id: input.manifest.runId, ...input.manifest },
        { session },
      );
    });
  }

  public async getRun(runId: string, session?: ClientSession): Promise<ControlPlaneRun | null> {
    const doc = await this.runs.findOne({ _id: runId }, { session });
    return stripMongoId(doc as RunDocument | null);
  }

  public async getRunManifest(
    runId: string,
    session?: ClientSession,
  ): Promise<ControlPlaneRunManifest | null> {
    const doc = await this.runManifests.findOne({ _id: runId }, { session });
    return stripMongoId(doc as RunManifestDocument | null);
  }

  public async replaceRun(run: ControlPlaneRun, session?: ClientSession): Promise<ControlPlaneRun> {
    await this.runs.updateOne(
      { _id: run.runId },
      {
        $set: run,
      },
      { upsert: true, session },
    );
    return run;
  }

  public async insertRunEvent(
    event: ControlPlaneRunEventIndex,
    session?: ClientSession,
  ): Promise<ControlPlaneRunEventIndex> {
    await this.runEvents.insertOne({ _id: event.eventId, ...event }, { session });
    return event;
  }

  public async updateRunEventProjectionStatus(
    eventId: string,
    projectionStatus: 'applied' | 'orphaned',
    session?: ClientSession,
  ): Promise<void> {
    await this.runEvents.updateOne(
      { _id: eventId },
      {
        $set: {
          projectionStatus,
        },
      },
      { session },
    );
  }

  public async findActiveRunForPipeline(pipelineId: string): Promise<ControlPlaneRun | null> {
    const doc = await this.runs.findOne(
      {
        pipelineId,
        status: { $in: ['queued', 'running'] },
      },
      {
        sort: {
          requestedAt: -1,
          runId: -1,
        },
      },
    );

    return stripMongoId(doc as RunDocument | null);
  }

  public async listRuns(
    query: z.infer<typeof listControlPlaneRunsQueryV2Schema>,
  ): Promise<z.infer<typeof listControlPlaneRunsResponseV2Schema>> {
    const cursor = decodeCursor(
      query.cursor,
      z.object({ requestedAt: z.string(), runId: z.string() }).strict(),
    );

    const clauses: Record<string, unknown>[] = [];
    if (query.pipelineId) {
      clauses.push({ pipelineId: query.pipelineId });
    }
    if (query.status) {
      clauses.push({ status: query.status });
    }
    if (query.source) {
      clauses.push({ source: query.source });
    }
    if (cursor) {
      clauses.push({
        $or: [
          { requestedAt: { $lt: cursor.requestedAt } },
          { requestedAt: cursor.requestedAt, runId: { $lt: cursor.runId } },
        ],
      });
    }

    const filter: Filter<RunDocument> =
      clauses.length === 0
        ? {}
        : clauses.length === 1
          ? (clauses[0] as Filter<RunDocument>)
          : ({ $and: clauses } as Filter<RunDocument>);
    const sort: Sort = { requestedAt: -1, runId: -1 };
    const docs = await this.runs
      .find(filter)
      .sort(sort)
      .limit(query.limit + 1)
      .toArray();
    const hasNext = docs.length > query.limit;
    const page = docs.slice(0, query.limit).map((doc) => stripMongoId(doc) as ControlPlaneRun);
    const nextCursor =
      hasNext && page.length > 0
        ? encodeCursor({
            requestedAt: page.at(-1)?.requestedAt,
            runId: page.at(-1)?.runId,
          })
        : null;

    return listControlPlaneRunsResponseV2Schema.parse({
      items: page,
      nextCursor,
    });
  }

  public async listRunEvents(
    runId: string,
    query: z.infer<typeof listControlPlaneRunEventsQueryV2Schema>,
  ): Promise<z.infer<typeof listControlPlaneRunEventsResponseV2Schema>> {
    const cursor = decodeCursor(
      query.cursor,
      z.object({ occurredAt: z.string(), eventId: z.string() }).strict(),
    );

    const clauses: Record<string, unknown>[] = [{ runId }];
    if (cursor) {
      clauses.push({
        $or: [
          { occurredAt: { $gt: cursor.occurredAt } },
          { occurredAt: cursor.occurredAt, eventId: { $gt: cursor.eventId } },
        ],
      });
    }

    const filter: Filter<RunEventDocument> =
      clauses.length === 1
        ? (clauses[0] as Filter<RunEventDocument>)
        : ({ $and: clauses } as Filter<RunEventDocument>);
    const sort: Sort = { occurredAt: 1, eventId: 1 };
    const docs = await this.runEvents
      .find(filter)
      .sort(sort)
      .limit(query.limit + 1)
      .toArray();
    const hasNext = docs.length > query.limit;
    const page = docs
      .slice(0, query.limit)
      .map((doc) => stripMongoId(doc) as ControlPlaneRunEventIndex);
    const nextCursor =
      hasNext && page.length > 0
        ? encodeCursor({
            occurredAt: page.at(-1)?.occurredAt,
            eventId: page.at(-1)?.eventId,
          })
        : null;

    return listControlPlaneRunEventsResponseV2Schema.parse({
      items: page,
      nextCursor,
    });
  }

  public async upsertRunJsonArtifactIndexRecord(
    item: z.infer<typeof jsonArtifactIndexItemV2Schema>,
    session?: ClientSession,
  ): Promise<z.infer<typeof jsonArtifactIndexItemV2Schema>> {
    await this.runJsonArtifacts.updateOne(
      { runId: item.runId, artifactId: item.artifactId },
      {
        $set: {
          ...item,
        },
        $setOnInsert: {
          _id: item.artifactId,
        },
      },
      { upsert: true, session },
    );
    return item;
  }

  public async listRunJsonArtifacts(
    runId: string,
    query: z.infer<typeof listRunJsonArtifactsQueryV2Schema>,
  ): Promise<z.infer<typeof listRunJsonArtifactsResponseV2Schema>> {
    const cursor =
      query.sortBy === 'createdAt'
        ? decodeCursor(
            query.cursor,
            z.object({ createdAt: z.string(), artifactId: z.string() }).strict(),
          )
        : decodeCursor(
            query.cursor,
            z.object({ fileName: z.string(), artifactId: z.string() }).strict(),
          );
    const clauses: Record<string, unknown>[] = [{ runId }];

    if (query.fileNamePrefix) {
      clauses.push({
        fileName: {
          $regex: `^${escapeRegexForPrefix(query.fileNamePrefix)}`,
          $options: 'i',
        },
      });
    }

    if (cursor && query.sortBy === 'createdAt' && 'createdAt' in cursor) {
      const comparator = query.sortDir === 'asc' ? '$gt' : '$lt';
      clauses.push({
        $or: [
          { createdAt: { [comparator]: cursor.createdAt } },
          { createdAt: cursor.createdAt, artifactId: { [comparator]: cursor.artifactId } },
        ],
      });
    }

    if (cursor && query.sortBy === 'fileName' && 'fileName' in cursor) {
      const comparator = query.sortDir === 'asc' ? '$gt' : '$lt';
      clauses.push({
        $or: [
          { fileName: { [comparator]: cursor.fileName } },
          { fileName: cursor.fileName, artifactId: { [comparator]: cursor.artifactId } },
        ],
      });
    }

    const filter: Filter<RunJsonArtifactIndexDocument> =
      clauses.length === 1
        ? (clauses[0] as Filter<RunJsonArtifactIndexDocument>)
        : ({ $and: clauses } as Filter<RunJsonArtifactIndexDocument>);

    const sort: Sort =
      query.sortBy === 'createdAt'
        ? {
            createdAt: query.sortDir === 'asc' ? 1 : -1,
            artifactId: query.sortDir === 'asc' ? 1 : -1,
          }
        : {
            fileName: query.sortDir === 'asc' ? 1 : -1,
            artifactId: query.sortDir === 'asc' ? 1 : -1,
          };

    const docs = await this.runJsonArtifacts
      .find(filter)
      .sort(sort)
      .limit(query.limit + 1)
      .toArray();
    const hasNext = docs.length > query.limit;
    const page = docs
      .slice(0, query.limit)
      .map((doc) => stripMongoId(doc) as z.infer<typeof jsonArtifactIndexItemV2Schema>);
    const last = page.at(-1);
    const nextCursor =
      hasNext && last
        ? encodeCursor(
            query.sortBy === 'createdAt'
              ? { createdAt: last.createdAt, artifactId: last.artifactId }
              : { fileName: last.fileName, artifactId: last.artifactId },
          )
        : null;

    return listRunJsonArtifactsResponseV2Schema.parse({
      runId,
      items: page.map((item) => ({
        artifactId: item.artifactId,
        fileName: item.fileName,
        createdAt: item.createdAt,
        sizeBytes: item.sizeBytes,
      })),
      nextCursor,
    });
  }

  public async getRunJsonArtifactIndexRecord(
    runId: string,
    artifactId: string,
  ): Promise<z.infer<typeof jsonArtifactIndexItemV2Schema> | null> {
    const doc = await this.runJsonArtifacts.findOne({ runId, artifactId });
    return stripMongoId(doc as RunJsonArtifactIndexDocument | null);
  }

  public async getPipelineRunIds(pipelineId: string): Promise<string[]> {
    const docs = await this.runs.find({ pipelineId }, { projection: { runId: 1 } }).toArray();
    return docs.map((doc) => doc.runId);
  }

  public async countUnsettledRunEvents(runIds: string[]): Promise<number> {
    if (runIds.length === 0) {
      return 0;
    }

    return this.runEvents.countDocuments({
      runId: { $in: runIds },
      projectionStatus: { $ne: 'applied' },
    });
  }

  public async deletePipelineControlPlaneData(pipelineId: string, runIds: string[]): Promise<void> {
    await this.withTransaction(async (session) => {
      await this.pipelines.deleteOne({ _id: pipelineId }, { session });
      if (runIds.length > 0) {
        await this.runs.deleteMany({ runId: { $in: runIds } }, { session });
        await this.runManifests.deleteMany({ runId: { $in: runIds } }, { session });
        await this.runEvents.deleteMany({ runId: { $in: runIds } }, { session });
        await this.runJsonArtifacts.deleteMany({ runId: { $in: runIds } }, { session });
      }
    });
  }

  public async getPipelineDeleteJob(pipelineId: string): Promise<PipelineDeleteJobRecord | null> {
    const doc = await this.pipelineDeleteJobs.findOne({ pipelineId });
    return doc ?? null;
  }

  public async upsertPipelineDeleteJob(
    job: PipelineDeleteJobRecord,
  ): Promise<PipelineDeleteJobRecord> {
    const upsertDoc = {
      ...job,
      progress: {
        totalSteps: PIPELINE_DELETE_JOB_TOTAL_STEPS,
        completedSteps: Math.min(job.progress.completedSteps, PIPELINE_DELETE_JOB_TOTAL_STEPS),
      },
    } satisfies PipelineDeleteJobRecord;

    await this.pipelineDeleteJobs.updateOne(
      { pipelineId: job.pipelineId },
      {
        $set: {
          pipelineId: upsertDoc.pipelineId,
          status: upsertDoc.status,
          progress: upsertDoc.progress,
          lastError: upsertDoc.lastError,
          attempts: upsertDoc.attempts,
          updatedAt: upsertDoc.updatedAt,
        },
        $setOnInsert: {
          _id: job._id,
          createdAt: job.createdAt,
        },
      },
      { upsert: true },
    );

    const persisted = await this.pipelineDeleteJobs.findOne({ pipelineId: job.pipelineId });
    if (!persisted) {
      throw new Error(`Failed to upsert delete job for pipeline "${job.pipelineId}".`);
    }

    return persisted;
  }
}

function escapeRegexForPrefix(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
