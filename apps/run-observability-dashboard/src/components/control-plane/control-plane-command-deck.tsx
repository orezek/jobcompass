import Link from 'next/link';
import type { ControlPlaneOverview } from '@/server/control-plane/service';
import { SectionHeading } from '@/components/control-plane/section-heading';
import { StartRunForm } from '@/components/control-plane/start-run-form';
import { startRunAction } from '@/app/control-plane/actions';

type ControlPlaneCommandDeckProps = {
  runs: ControlPlaneOverview['runs'];
  pipelines: ControlPlaneOverview['pipelines'];
  executionMode: string;
  brokerBackend: string;
  brokerDir: string;
  dataDir: string;
  brokerTopic?: string;
};

export function ControlPlaneCommandDeck({
  runs,
  pipelines,
  executionMode,
  brokerBackend,
  brokerDir,
  dataDir,
  brokerTopic,
}: ControlPlaneCommandDeckProps) {
  const pipelineNames = new Map(pipelines.map((pipeline) => [pipeline.id, pipeline.name]));
  const activePipelineRuns: Record<string, { runId: string; status: 'queued' | 'running' }> = {};
  const activeRuns = runs.filter(
    (runView) => runView.computedStatus === 'queued' || runView.computedStatus === 'running',
  );

  for (const runView of runs) {
    if (
      (runView.computedStatus === 'queued' || runView.computedStatus === 'running') &&
      !activePipelineRuns[runView.run.pipelineId]
    ) {
      activePipelineRuns[runView.run.pipelineId] = {
        runId: runView.run.runId,
        status: runView.computedStatus,
      };
    }
  }

  return (
    <section className="panel control-plane-toolbar">
      <div className="control-plane-toolbar__layout">
        <div>
          <SectionHeading
            eyebrow="Command deck"
            title="Launch and monitor"
            description="Start one pipeline at a time, keep the latest runs visible, and expand configuration only when you need to change it."
          />
          <StartRunForm
            action={startRunAction}
            pipelines={pipelines.map((pipeline) => ({
              id: pipeline.id,
              name: pipeline.name,
            }))}
            activePipelineRuns={activePipelineRuns}
          />
        </div>
        <div className="control-plane-toolbar__sidebar">
          <div className="control-plane-toolbar__meta">
            <div className="meta-chip">BROKER: {brokerBackend}</div>
            <div className="meta-chip">ARCHIVE: {brokerDir}</div>
            {brokerTopic ? <div className="meta-chip">TOPIC: {brokerTopic}</div> : null}
            <div className="meta-chip">STATE: {dataDir}</div>
            <div className="meta-chip">MODE VIA ENV: CONTROL_PLANE_EXECUTION_MODE</div>
            <Link href="/" className="primary-link">
              Open observability dashboard
            </Link>
          </div>
          {activeRuns.length > 0 ? (
            <div className="active-run-list" data-testid="active-run-list">
              <p className="eyebrow">Active runs</p>
              <ul className="detail-list">
                {activeRuns.map((runView) => (
                  <li key={runView.run.runId}>
                    <Link href={`/control-plane/runs/${runView.run.runId}`}>
                      {pipelineNames.get(runView.run.pipelineId) ?? runView.run.pipelineId}
                    </Link>{' '}
                    • {runView.run.runId} • {runView.computedStatus}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="empty-copy">
              No active runs. The command deck is idle and ready for the next operator action.
            </p>
          )}
        </div>
      </div>
      <p className="empty-copy">
        Execution mode is configured through the dashboard environment and shown in the header. The
        v1 operator surface does not provide an in-app mode switch. Active mode: {executionMode}.
      </p>
    </section>
  );
}
