import type { ArtifactStorageSnapshot } from '@repo/control-plane-contracts';
import {
  buildArtifactRunLayout,
  ensureArtifactRunReady,
  writeDatasetMetadata,
  writeHtmlArtifact,
} from '@repo/control-plane-adapters';

export type SharedRunOutputPaths = ReturnType<typeof buildArtifactRunLayout> & {
  crawlRunId: string;
  destination: ArtifactStorageSnapshot;
  gcpProjectId?: string;
};

export const buildSharedRunOutputPaths = (
  destination: ArtifactStorageSnapshot,
  crawlRunId: string,
  gcpProjectId?: string,
): SharedRunOutputPaths => ({
  ...buildArtifactRunLayout(destination, crawlRunId),
  crawlRunId,
  destination,
  gcpProjectId,
});

export const prepareSharedRunOutput = async (paths: SharedRunOutputPaths): Promise<void> => {
  await ensureArtifactRunReady({
    destination: paths.destination,
    crawlRunId: paths.crawlRunId,
    projectId: paths.gcpProjectId,
  });
};

export const writeSharedDetailHtml = async (
  paths: SharedRunOutputPaths,
  sourceId: string,
  html: string,
  checksum: string,
  sizeBytes: number,
): Promise<string> => {
  const artifact = await writeHtmlArtifact({
    destination: paths.destination,
    crawlRunId: paths.crawlRunId,
    sourceId,
    html,
    checksum,
    sizeBytes,
    projectId: paths.gcpProjectId,
  });

  return artifact.storagePath;
};

export const writeSharedDatasetJson = async (
  paths: SharedRunOutputPaths,
  datasetRecords: unknown[],
): Promise<string> => {
  return writeDatasetMetadata({
    destination: paths.destination,
    crawlRunId: paths.crawlRunId,
    datasetRecords,
    projectId: paths.gcpProjectId,
  });
};
