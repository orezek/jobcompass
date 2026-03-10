import { notFound } from 'next/navigation';
import { PipelineDetailClient } from '@/components/pipelines/pipeline-detail-client';
import { ControlServiceNotReachable } from '@/components/state/control-service-not-reachable';
import {
  buildControlServiceConnectivityDiagnostic,
  ControlServiceRequestError,
  getPipeline,
  isControlServiceUnavailableError,
  listRuns,
} from '@/lib/control-service-client';

export const dynamic = 'force-dynamic';

export default async function PipelineDetailPage({
  params,
}: {
  params: Promise<{ pipelineId: string }>;
}) {
  const { pipelineId } = await params;

  try {
    const [pipeline, runs] = await Promise.all([
      getPipeline(pipelineId),
      listRuns({ pipelineId, limit: 12 }),
    ]);

    const recentRuns = runs.items
      .slice()
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));

    return <PipelineDetailClient pipeline={pipeline} initialRuns={recentRuns} />;
  } catch (error) {
    if (error instanceof ControlServiceRequestError && error.status === 404) {
      notFound();
    }
    if (isControlServiceUnavailableError(error)) {
      return (
        <ControlServiceNotReachable
          diagnostic={buildControlServiceConnectivityDiagnostic(
            error,
            `GET /v1/pipelines/${pipelineId}`,
          )}
        />
      );
    }

    throw error;
  }
}
