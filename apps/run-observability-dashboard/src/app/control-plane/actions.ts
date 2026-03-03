'use server';

import { revalidatePath } from 'next/cache';
import {
  archiveArtifactDestination,
  archivePipeline,
  archiveRuntimeProfile,
  archiveSearchSpace,
  archiveStructuredOutputDestination,
  createArtifactDestination,
  createPipeline,
  createRuntimeProfile,
  createSearchSpace,
  createStructuredOutputDestination,
  deleteArtifactDestination,
  deletePipeline,
  deleteRuntimeProfile,
  deleteSearchSpace,
  deleteStructuredOutputDestination,
  startRun,
  updateArtifactDestination,
  updatePipeline,
  updateRuntimeProfile,
  updateSearchSpace,
  updateStructuredOutputDestination,
} from '@/server/control-plane/service';

function getRequiredString(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required field "${key}".`);
  }

  return value.trim();
}

function getOptionalString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function getPositiveInt(formData: FormData, key: string): number {
  const value = Number.parseInt(getRequiredString(formData, key), 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Field "${key}" must be a positive integer.`);
  }

  return value;
}

function getBoolean(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on';
}

function parseMultilineUrls(value: string): string[] {
  return value
    .split(/\r?\n|,/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseStructuredOutputIds(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function buildSearchSpaceInput(formData: FormData) {
  return {
    id: getOptionalString(formData, 'id'),
    name: getRequiredString(formData, 'name'),
    description: getOptionalString(formData, 'description') ?? '',
    sourceType: 'jobs_cz' as const,
    startUrls: parseMultilineUrls(getRequiredString(formData, 'startUrls')),
    maxItemsDefault: getPositiveInt(formData, 'maxItemsDefault'),
    allowInactiveMarkingOnPartialRuns: getBoolean(formData, 'allowInactiveMarkingOnPartialRuns'),
    status: 'active' as const,
  };
}

function buildRuntimeProfileInput(formData: FormData) {
  return {
    id: getOptionalString(formData, 'id'),
    name: getRequiredString(formData, 'name'),
    crawlerMaxConcurrency: getPositiveInt(formData, 'crawlerMaxConcurrency'),
    crawlerMaxRequestsPerMinute: getPositiveInt(formData, 'crawlerMaxRequestsPerMinute'),
    ingestionConcurrency: getPositiveInt(formData, 'ingestionConcurrency'),
    ingestionEnabled: getBoolean(formData, 'ingestionEnabled'),
    debugLog: getBoolean(formData, 'debugLog'),
    status: 'active' as const,
  };
}

function buildArtifactDestinationInput(formData: FormData) {
  const type = getRequiredString(formData, 'type');
  if (type === 'gcs') {
    return {
      id: getOptionalString(formData, 'id'),
      name: getRequiredString(formData, 'name'),
      type: 'gcs' as const,
      config: {
        bucket: getRequiredString(formData, 'bucket'),
        prefix: getOptionalString(formData, 'prefix') ?? '',
      },
      status: 'active' as const,
    };
  }

  return {
    id: getOptionalString(formData, 'id'),
    name: getRequiredString(formData, 'name'),
    type: 'local_filesystem' as const,
    config: {
      basePath: getRequiredString(formData, 'basePath'),
    },
    status: 'active' as const,
  };
}

function buildStructuredOutputDestinationInput(formData: FormData) {
  const type = getRequiredString(formData, 'type');
  if (type === 'mongodb') {
    return {
      id: getOptionalString(formData, 'id'),
      name: getRequiredString(formData, 'name'),
      type: 'mongodb' as const,
      config: {
        connectionRef: getOptionalString(formData, 'connectionRef'),
        collectionName: getOptionalString(formData, 'collectionName') ?? 'normalized_job_ads',
      },
      status: 'active' as const,
    };
  }

  if (type === 'gcs_json') {
    return {
      id: getOptionalString(formData, 'id'),
      name: getRequiredString(formData, 'name'),
      type: 'gcs_json' as const,
      config: {
        bucket: getRequiredString(formData, 'bucket'),
        prefix: getOptionalString(formData, 'prefix') ?? '',
      },
      status: 'active' as const,
    };
  }

  return {
    id: getOptionalString(formData, 'id'),
    name: getRequiredString(formData, 'name'),
    type: 'local_json' as const,
    config: {
      basePath: getRequiredString(formData, 'basePath'),
    },
    status: 'active' as const,
  };
}

function buildPipelineInput(formData: FormData) {
  const mode: 'crawl_only' | 'crawl_and_ingest' =
    getRequiredString(formData, 'mode') === 'crawl_only' ? 'crawl_only' : 'crawl_and_ingest';

  return {
    id: getOptionalString(formData, 'id'),
    name: getRequiredString(formData, 'name'),
    searchSpaceId: getRequiredString(formData, 'searchSpaceId'),
    runtimeProfileId: getRequiredString(formData, 'runtimeProfileId'),
    artifactDestinationId: getRequiredString(formData, 'artifactDestinationId'),
    structuredOutputDestinationIds: parseStructuredOutputIds(
      getOptionalString(formData, 'structuredOutputDestinationIds'),
    ),
    mode,
    status: 'active' as const,
  };
}

export async function createSearchSpaceAction(formData: FormData): Promise<void> {
  await createSearchSpace(buildSearchSpaceInput(formData));

  revalidatePath('/control-plane');
}

export async function updateSearchSpaceAction(formData: FormData): Promise<void> {
  await updateSearchSpace(getRequiredString(formData, 'id'), buildSearchSpaceInput(formData));
  revalidatePath('/control-plane');
}

export async function archiveSearchSpaceAction(formData: FormData): Promise<void> {
  await archiveSearchSpace(getRequiredString(formData, 'id'));
  revalidatePath('/control-plane');
}

export async function deleteSearchSpaceAction(formData: FormData): Promise<void> {
  await deleteSearchSpace(getRequiredString(formData, 'id'));
  revalidatePath('/control-plane');
}

export async function createRuntimeProfileAction(formData: FormData): Promise<void> {
  await createRuntimeProfile(buildRuntimeProfileInput(formData));

  revalidatePath('/control-plane');
}

export async function updateRuntimeProfileAction(formData: FormData): Promise<void> {
  await updateRuntimeProfile(getRequiredString(formData, 'id'), buildRuntimeProfileInput(formData));
  revalidatePath('/control-plane');
}

export async function archiveRuntimeProfileAction(formData: FormData): Promise<void> {
  await archiveRuntimeProfile(getRequiredString(formData, 'id'));
  revalidatePath('/control-plane');
}

export async function deleteRuntimeProfileAction(formData: FormData): Promise<void> {
  await deleteRuntimeProfile(getRequiredString(formData, 'id'));
  revalidatePath('/control-plane');
}

export async function createArtifactDestinationAction(formData: FormData): Promise<void> {
  await createArtifactDestination(buildArtifactDestinationInput(formData));

  revalidatePath('/control-plane');
}

export async function updateArtifactDestinationAction(formData: FormData): Promise<void> {
  await updateArtifactDestination(
    getRequiredString(formData, 'id'),
    buildArtifactDestinationInput(formData),
  );
  revalidatePath('/control-plane');
}

export async function archiveArtifactDestinationAction(formData: FormData): Promise<void> {
  await archiveArtifactDestination(getRequiredString(formData, 'id'));
  revalidatePath('/control-plane');
}

export async function deleteArtifactDestinationAction(formData: FormData): Promise<void> {
  await deleteArtifactDestination(getRequiredString(formData, 'id'));
  revalidatePath('/control-plane');
}

export async function createStructuredOutputDestinationAction(formData: FormData): Promise<void> {
  await createStructuredOutputDestination(buildStructuredOutputDestinationInput(formData));

  revalidatePath('/control-plane');
}

export async function updateStructuredOutputDestinationAction(formData: FormData): Promise<void> {
  await updateStructuredOutputDestination(
    getRequiredString(formData, 'id'),
    buildStructuredOutputDestinationInput(formData),
  );
  revalidatePath('/control-plane');
}

export async function archiveStructuredOutputDestinationAction(formData: FormData): Promise<void> {
  await archiveStructuredOutputDestination(getRequiredString(formData, 'id'));
  revalidatePath('/control-plane');
}

export async function deleteStructuredOutputDestinationAction(formData: FormData): Promise<void> {
  await deleteStructuredOutputDestination(getRequiredString(formData, 'id'));
  revalidatePath('/control-plane');
}

export async function createPipelineAction(formData: FormData): Promise<void> {
  await createPipeline(buildPipelineInput(formData));

  revalidatePath('/control-plane');
}

export async function updatePipelineAction(formData: FormData): Promise<void> {
  await updatePipeline(getRequiredString(formData, 'id'), buildPipelineInput(formData));
  revalidatePath('/control-plane');
}

export async function archivePipelineAction(formData: FormData): Promise<void> {
  await archivePipeline(getRequiredString(formData, 'id'));
  revalidatePath('/control-plane');
}

export async function deletePipelineAction(formData: FormData): Promise<void> {
  await deletePipeline(getRequiredString(formData, 'id'));
  revalidatePath('/control-plane');
}

export async function startRunAction(formData: FormData): Promise<void> {
  await startRun({
    pipelineId: getRequiredString(formData, 'pipelineId'),
    createdBy: 'dashboard-ui',
  });

  revalidatePath('/control-plane');
}
