import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { BrokerEvent, RunManifest } from '@repo/control-plane-contracts';
import { buildArtifactRunDir, readBrokerEvents } from '@repo/control-plane-contracts';
import { controlPlaneBrokerRootDir } from '@/server/control-plane/paths';
import { getRunManifest, getRunRecord } from '@/server/control-plane/store';
import {
  readTextPreview,
  type ControlPlaneFilePreview,
} from '@/server/control-plane/file-previews';

export type ControlPlaneArtifactCapture = {
  eventId: string;
  occurredAt: string;
  producer: string;
  source: string;
  sourceId: string;
  dedupeKey: string;
  adUrl: string;
  jobTitle: string;
  artifactPath: string;
  artifactStorageType: 'local_filesystem' | 'gcs';
  artifactSizeBytes: number;
  checksum: string;
  htmlDetailPageKey: string;
};

export type ControlPlaneArtifactPreview = {
  capture: ControlPlaneArtifactCapture;
  preview: ControlPlaneFilePreview;
};

export type ControlPlaneArtifactDownload = {
  capture: ControlPlaneArtifactCapture;
  fileName: string;
  filePath: string;
  contents: Buffer;
  contentType: string;
};

export function buildArtifactCaptures(events: BrokerEvent[]): ControlPlaneArtifactCapture[] {
  return events
    .filter((event): event is Extract<BrokerEvent, { eventType: 'crawler.detail.captured' }> => {
      return event.eventType === 'crawler.detail.captured';
    })
    .map((event) => ({
      eventId: event.eventId,
      occurredAt: event.occurredAt,
      producer: event.producer,
      source: event.payload.source,
      sourceId: event.payload.sourceId,
      dedupeKey: event.payload.dedupeKey,
      adUrl: event.payload.listingRecord.adUrl,
      jobTitle: event.payload.listingRecord.jobTitle,
      artifactPath: event.payload.artifact.storagePath,
      artifactStorageType: event.payload.artifact.storageType,
      artifactSizeBytes: event.payload.artifact.sizeBytes,
      checksum: event.payload.artifact.checksum,
      htmlDetailPageKey: event.payload.listingRecord.htmlDetailPageKey,
    }));
}

async function getRunArtifactCaptures(runId: string): Promise<ControlPlaneArtifactCapture[]> {
  const run = await getRunRecord(runId);
  if (!run) {
    throw new Error(`Unknown run "${runId}".`);
  }

  const events = await readBrokerEvents(controlPlaneBrokerRootDir, runId);
  return buildArtifactCaptures(events);
}

async function resolveLocalArtifactPath(
  runId: string,
  manifest: RunManifest,
  capture: ControlPlaneArtifactCapture,
): Promise<string> {
  if (capture.artifactStorageType !== 'local_filesystem') {
    throw new Error(
      `Artifact "${capture.sourceId}" uses "${capture.artifactStorageType}" storage. Browser preview and download for that adapter will be added when the cloud adapter slice is implemented.`,
    );
  }

  if (
    manifest.artifactDestinationSnapshot.type !== 'local_filesystem' ||
    !('basePath' in manifest.artifactDestinationSnapshot.config)
  ) {
    throw new Error(
      `Run "${runId}" does not use a local filesystem artifact destination and cannot be read locally.`,
    );
  }

  const expectedRunDir = path.resolve(
    buildArtifactRunDir(manifest.artifactDestinationSnapshot.config.basePath, runId),
  );
  const resolvedArtifactPath = path.resolve(capture.artifactPath);
  const expectedPrefix = `${expectedRunDir}${path.sep}`;

  if (resolvedArtifactPath !== expectedRunDir && !resolvedArtifactPath.startsWith(expectedPrefix)) {
    throw new Error(
      `Artifact "${capture.sourceId}" resolved outside the run artifact directory and cannot be served.`,
    );
  }

  return resolvedArtifactPath;
}

async function getRunArtifactCapture(input: {
  runId: string;
  sourceId: string;
}): Promise<{ capture: ControlPlaneArtifactCapture; manifest: RunManifest }> {
  const [captures, manifest] = await Promise.all([
    getRunArtifactCaptures(input.runId),
    getRunManifest(input.runId),
  ]);

  if (!manifest) {
    throw new Error(`Run "${input.runId}" does not have a persisted manifest.`);
  }

  const capture = captures.find((item) => item.sourceId === input.sourceId);
  if (!capture) {
    throw new Error(`Run "${input.runId}" does not include artifact "${input.sourceId}".`);
  }

  return { capture, manifest };
}

export async function getControlPlaneRunArtifactPreview(input: {
  runId: string;
  sourceId: string;
  maxChars?: number;
}): Promise<ControlPlaneArtifactPreview> {
  const { capture, manifest } = await getRunArtifactCapture(input);
  const resolvedArtifactPath = await resolveLocalArtifactPath(input.runId, manifest, capture);

  return {
    capture,
    preview: await readTextPreview(resolvedArtifactPath, input.maxChars ?? 24_000),
  };
}

export async function getControlPlaneRunArtifactDownload(input: {
  runId: string;
  sourceId: string;
}): Promise<ControlPlaneArtifactDownload> {
  const { capture, manifest } = await getRunArtifactCapture(input);
  const resolvedArtifactPath = await resolveLocalArtifactPath(input.runId, manifest, capture);

  return {
    capture,
    fileName: capture.htmlDetailPageKey,
    filePath: resolvedArtifactPath,
    contents: await readFile(resolvedArtifactPath),
    contentType: 'text/html; charset=utf-8',
  };
}
