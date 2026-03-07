import { PipelineListClient } from '@/components/pipelines/pipeline-list-client';
import { listPipelines } from '@/lib/control-service-client';

export const dynamic = 'force-dynamic';

export default async function PipelinesPage() {
  const response = await listPipelines();
  const pipelines = response.items
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return <PipelineListClient pipelines={pipelines} />;
}
