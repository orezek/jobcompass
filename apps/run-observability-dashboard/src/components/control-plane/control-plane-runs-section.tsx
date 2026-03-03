import Link from 'next/link';
import type { ControlPlaneOverview } from '@/server/control-plane/service';
import { StatusBadge } from '@/components/state/status-badge';
import { SectionHeading } from '@/components/control-plane/section-heading';
import { formatDateTime } from '@/server/lib/formatting';

type ControlPlaneRunsSectionProps = {
  runs: ControlPlaneOverview['runs'];
  pipelines: ControlPlaneOverview['pipelines'];
};

export function ControlPlaneRunsSection({ runs, pipelines }: ControlPlaneRunsSectionProps) {
  const pipelineNames = new Map(pipelines.map((pipeline) => [pipeline.id, pipeline.name]));

  return (
    <section className="panel">
      <SectionHeading
        eyebrow="Runs"
        title="Recent control-plane runs"
        description="Each run snapshots the pipeline into an immutable manifest and keeps worker runtime state separate from the base run record."
      />
      {runs.length === 0 ? (
        <p className="empty-copy">No control-plane runs have been started yet.</p>
      ) : (
        <div className="table-wrap" data-testid="control-plane-runs">
          <table className="data-table">
            <thead>
              <tr>
                <th>RUN</th>
                <th>PIPELINE</th>
                <th>STATUS</th>
                <th>CRAWLER</th>
                <th>INGESTION</th>
                <th>REQUESTED</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((entry) => (
                <tr key={entry.run.runId}>
                  <td>
                    <Link href={`/control-plane/runs/${entry.run.runId}`}>{entry.run.runId}</Link>
                  </td>
                  <td>{pipelineNames.get(entry.run.pipelineId) ?? entry.run.pipelineId}</td>
                  <td>
                    <StatusBadge label="RUN" status={entry.computedStatus} />
                  </td>
                  <td>
                    {entry.crawlerRuntime ? (
                      <StatusBadge label="CRAWLER" status={entry.crawlerRuntime.status} />
                    ) : (
                      'N/A'
                    )}
                  </td>
                  <td>
                    {entry.ingestionRuntime ? (
                      <StatusBadge label="INGESTION" status={entry.ingestionRuntime.status} />
                    ) : (
                      'DISABLED'
                    )}
                  </td>
                  <td>{formatDateTime(entry.run.requestedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
