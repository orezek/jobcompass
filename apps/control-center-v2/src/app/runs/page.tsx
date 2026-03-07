import { RunListClient } from '@/components/runs/run-list-client';
import { listControlPlaneRunsQueryV2Schema } from '@repo/control-plane-contracts/v2';
import { listPipelines, listRuns } from '@/lib/control-service-client';

export const dynamic = 'force-dynamic';

export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawSearchParams = await searchParams;
  const query = listControlPlaneRunsQueryV2Schema.parse({
    pipelineId:
      typeof rawSearchParams.pipelineId === 'string' ? rawSearchParams.pipelineId : undefined,
    status: typeof rawSearchParams.status === 'string' ? rawSearchParams.status : undefined,
    source: typeof rawSearchParams.source === 'string' ? rawSearchParams.source : undefined,
    limit: typeof rawSearchParams.limit === 'string' ? Number(rawSearchParams.limit) : undefined,
    cursor: typeof rawSearchParams.cursor === 'string' ? rawSearchParams.cursor : undefined,
  });

  const [runs, pipelines] = await Promise.all([listRuns(query), listPipelines()]);
  const sortedRuns = runs.items
    .slice()
    .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
  const sortedPipelines = pipelines.items
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return (
    <RunListClient
      initialRuns={sortedRuns}
      filters={query}
      nextCursor={runs.nextCursor}
      pipelines={sortedPipelines}
    />
  );
}
