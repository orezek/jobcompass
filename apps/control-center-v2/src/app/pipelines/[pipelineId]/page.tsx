import { notFound } from 'next/navigation';
import { PipelineDetailClient } from '@/components/pipelines/pipeline-detail-client';
import { ControlServiceRequestError, getPipeline, listRuns } from '@/lib/control-service-client';

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

    throw error;
  }
}
