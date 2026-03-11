import { notFound } from 'next/navigation';
import { RunDetailClient } from '@/components/runs/run-detail-client';
import { ControlServiceNotReachable } from '@/components/state/control-service-not-reachable';
import {
  buildControlServiceConnectivityDiagnostic,
  ControlServiceRequestError,
  getRun,
  isControlServiceUnavailableError,
  listRunEvents,
  listRunJsonArtifacts,
} from '@/lib/control-service-client';

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
    const [run, events, jsonArtifacts] = await Promise.all([
      getRun(runId),
      listRunEvents(runId, {
        limit: 50,
        cursor: typeof rawSearchParams.cursor === 'string' ? rawSearchParams.cursor : undefined,
      }),
      listRunJsonArtifacts(runId, {
        limit: 50,
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
        initialJsonArtifacts={jsonArtifacts.items}
      />
    );
  } catch (error) {
    if (error instanceof ControlServiceRequestError && error.status === 404) {
      notFound();
    }
    if (isControlServiceUnavailableError(error)) {
      return (
        <ControlServiceNotReachable
          diagnostic={buildControlServiceConnectivityDiagnostic(error, `GET /v1/runs/${runId}`)}
        />
      );
    }

    throw error;
  }
}
