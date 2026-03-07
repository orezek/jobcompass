import 'server-only';
import {
  controlPlanePipelineV2Schema,
  controlPlaneRunV2Schema,
  controlServiceCancelRunAcceptedResponseV2Schema,
  controlServiceErrorResponseV2Schema,
  controlServiceHeartbeatResponseV2Schema,
  controlServiceStartPipelineRunAcceptedResponseV2Schema,
  createControlPlanePipelineRequestV2Schema,
  listControlPlanePipelinesResponseV2Schema,
  listControlPlaneRunEventsQueryV2Schema,
  listControlPlaneRunEventsResponseV2Schema,
  listControlPlaneRunsQueryV2Schema,
  listControlPlaneRunsResponseV2Schema,
  updateControlPlanePipelineRequestV2Schema,
} from '@repo/control-plane-contracts/v2';
import { z } from 'zod';
import { getEnv } from '@/lib/env';
import type {
  ControlPlanePipeline,
  ControlPlaneRun,
  ControlServiceHeartbeat,
  CreateControlPlanePipelineRequest,
  ListControlPlanePipelinesResponse,
  ListControlPlaneRunEventsQuery,
  ListControlPlaneRunEventsResponse,
  ListControlPlaneRunsQuery,
  ListControlPlaneRunsResponse,
  UpdateControlPlanePipelineRequest,
} from '@/lib/contracts';

export class ControlServiceRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ControlServiceRequestError';
  }
}

const buildUrl = (path: string, query?: URLSearchParams): string => {
  const baseUrl = getEnv().CONTROL_SERVICE_BASE_URL.replace(/\/+$/, '');
  const suffix = query && query.toString().length > 0 ? `?${query.toString()}` : '';
  return `${baseUrl}${path}${suffix}`;
};

const buildHeaders = (init?: HeadersInit): Headers => {
  const env = getEnv();
  const headers = new Headers(init);
  headers.set('Authorization', `Bearer ${env.CONTROL_SHARED_TOKEN}`);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  return headers;
};

const parseError = async (response: Response): Promise<never> => {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = await response.json();
    const parsed = controlServiceErrorResponseV2Schema.safeParse(payload);
    if (parsed.success) {
      throw new ControlServiceRequestError(
        response.status,
        parsed.data.error.message,
        parsed.data.error.details,
      );
    }
  }

  throw new ControlServiceRequestError(response.status, response.statusText || 'Request failed.');
};

async function requestJson<T>(input: {
  path: string;
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  schema: z.ZodType<T>;
  query?: URLSearchParams;
}): Promise<T> {
  const response = await fetch(buildUrl(input.path, input.query), {
    method: input.method ?? 'GET',
    cache: 'no-store',
    headers: buildHeaders(
      input.body === undefined
        ? undefined
        : {
            'Content-Type': 'application/json',
          },
    ),
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });

  if (!response.ok) {
    await parseError(response);
  }

  return input.schema.parse(await response.json());
}

export const listPipelines = async (): Promise<ListControlPlanePipelinesResponse> =>
  requestJson({
    path: '/v1/pipelines',
    schema: listControlPlanePipelinesResponseV2Schema,
  });

export const getPipeline = async (pipelineId: string): Promise<ControlPlanePipeline> =>
  requestJson({
    path: `/v1/pipelines/${pipelineId}`,
    schema: controlPlanePipelineV2Schema,
  });

export const createPipeline = async (
  payload: CreateControlPlanePipelineRequest,
): Promise<ControlPlanePipeline> =>
  requestJson({
    path: '/v1/pipelines',
    method: 'POST',
    body: createControlPlanePipelineRequestV2Schema.parse(payload),
    schema: controlPlanePipelineV2Schema,
  });

export const renamePipeline = async (
  pipelineId: string,
  payload: UpdateControlPlanePipelineRequest,
): Promise<ControlPlanePipeline> =>
  requestJson({
    path: `/v1/pipelines/${pipelineId}`,
    method: 'PATCH',
    body: updateControlPlanePipelineRequestV2Schema.parse(payload),
    schema: controlPlanePipelineV2Schema,
  });

export const startPipelineRun = async (
  pipelineId: string,
): Promise<{ pipelineId: string; runId: string }> => {
  const response = await requestJson({
    path: `/v1/pipelines/${pipelineId}/runs`,
    method: 'POST',
    body: {},
    schema: controlServiceStartPipelineRunAcceptedResponseV2Schema,
  });

  return {
    pipelineId: response.pipelineId,
    runId: response.runId,
  };
};

export const cancelRun = async (runId: string): Promise<{ runId: string }> => {
  const response = await requestJson({
    path: `/v1/runs/${runId}/cancel`,
    method: 'POST',
    body: {},
    schema: controlServiceCancelRunAcceptedResponseV2Schema,
  });

  return { runId: response.runId };
};

export const listRuns = async (
  query: Partial<ListControlPlaneRunsQuery>,
): Promise<ListControlPlaneRunsResponse> => {
  const parsed = listControlPlaneRunsQueryV2Schema.parse(query);
  const search = new URLSearchParams();
  if (parsed.pipelineId) search.set('pipelineId', parsed.pipelineId);
  if (parsed.status) search.set('status', parsed.status);
  if (parsed.source) search.set('source', parsed.source);
  if (parsed.limit) search.set('limit', String(parsed.limit));
  if (parsed.cursor) search.set('cursor', parsed.cursor);

  return requestJson({
    path: '/v1/runs',
    schema: listControlPlaneRunsResponseV2Schema,
    query: search,
  });
};

export const getRun = async (runId: string): Promise<ControlPlaneRun> =>
  requestJson({
    path: `/v1/runs/${runId}`,
    schema: controlPlaneRunV2Schema,
  });

export const listRunEvents = async (
  runId: string,
  query: Partial<ListControlPlaneRunEventsQuery>,
): Promise<ListControlPlaneRunEventsResponse> => {
  const parsed = listControlPlaneRunEventsQueryV2Schema.parse(query);
  const search = new URLSearchParams();
  if (parsed.limit) search.set('limit', String(parsed.limit));
  if (parsed.cursor) search.set('cursor', parsed.cursor);

  return requestJson({
    path: `/v1/runs/${runId}/events`,
    schema: listControlPlaneRunEventsResponseV2Schema,
    query: search,
  });
};

export const getHeartbeat = async (): Promise<ControlServiceHeartbeat> =>
  requestJson({
    path: '/heartbeat',
    schema: controlServiceHeartbeatResponseV2Schema,
  });

export const buildControlServiceStreamRequest = (searchParams: URLSearchParams): Request => {
  const allowed = new URLSearchParams();
  for (const key of ['pipelineId', 'runId']) {
    const value = searchParams.get(key);
    if (value) {
      allowed.set(key, value);
    }
  }

  return new Request(buildUrl('/v1/stream', allowed), {
    method: 'GET',
    headers: buildHeaders({
      Accept: 'text/event-stream',
    }),
  });
};
