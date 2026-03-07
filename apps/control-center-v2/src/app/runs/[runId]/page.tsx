import { notFound } from 'next/navigation';
import { RunDetailClient } from '@/components/runs/run-detail-client';
import { ControlServiceRequestError, getRun, listRunEvents } from '@/lib/control-service-client';

export const dynamic = 'force-dynamic';

export default async function RunDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { runId } = await params;
  const rawSearchParams = await searchParams;

  try {
    const [run, events] = await Promise.all([
      getRun(runId),
      listRunEvents(runId, {
        limit: 50,
        cursor: typeof rawSearchParams.cursor === 'string' ? rawSearchParams.cursor : undefined,
      }),
    ]);

    const sortedEvents = events.items
      .slice()
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));

    return (
      <RunDetailClient
        initialRun={run}
        initialEvents={sortedEvents}
        nextCursor={events.nextCursor}
      />
    );
  } catch (error) {
    if (error instanceof ControlServiceRequestError && error.status === 404) {
      notFound();
    }

    throw error;
  }
}
