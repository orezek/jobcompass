import { AppShell } from '@/components/layout/app-shell';
import { PageHeader } from '@/components/layout/page-header';
import { ControlPlaneSummaryGrid } from '@/components/control-plane/control-plane-summary-grid';
import { ControlPlaneCommandDeck } from '@/components/control-plane/control-plane-command-deck';
import { ControlPlaneRunsSection } from '@/components/control-plane/control-plane-runs-section';
import { SearchSpaceSection } from '@/components/control-plane/search-space-section';
import { RuntimeProfileSection } from '@/components/control-plane/runtime-profile-section';
import { ArtifactDestinationSection } from '@/components/control-plane/artifact-destination-section';
import { StructuredOutputSection } from '@/components/control-plane/structured-output-section';
import { PipelineSection } from '@/components/control-plane/pipeline-section';
import { env } from '@/server/env';
import { getControlPlaneOverview } from '@/server/control-plane/service';

export const dynamic = 'force-dynamic';

export default async function ControlPlanePage() {
  const overview = await getControlPlaneOverview();
  const activeRuns = overview.runs.filter(
    (runView) => runView.computedStatus === 'queued' || runView.computedStatus === 'running',
  ).length;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Control plane"
        title="Local operator surface"
        description="Bootstrap search spaces, wire local pipelines, generate Apify-compatible INPUT.json, and launch v1 local runs without changing the current crawler or ingestion compatibility contracts."
        environmentLabel={`CONTROL ${env.CONTROL_PLANE_EXECUTION_MODE.toUpperCase()}`}
        databaseName={env.MONGODB_DB_NAME}
        generatedAt={new Date().toISOString()}
        latestCrawlerStatus={overview.runs[0]?.crawlerRuntime?.status ?? null}
        latestIngestionStatus={overview.runs[0]?.ingestionRuntime?.status ?? null}
      />

      <ControlPlaneSummaryGrid
        searchSpaces={overview.searchSpaces.length}
        runtimeProfiles={overview.runtimeProfiles.length}
        artifactDestinations={overview.artifactDestinations.length}
        structuredOutputs={overview.structuredOutputDestinations.length}
        pipelines={overview.pipelines.length}
        activeRuns={activeRuns}
      />

      <ControlPlaneCommandDeck
        runs={overview.runs}
        pipelines={overview.pipelines}
        executionMode={env.CONTROL_PLANE_EXECUTION_MODE}
        brokerBackend={env.CONTROL_PLANE_BROKER_BACKEND}
        brokerDir={env.CONTROL_PLANE_BROKER_DIR}
        dataDir={env.CONTROL_PLANE_DATA_DIR}
        brokerTopic={
          env.CONTROL_PLANE_BROKER_BACKEND === 'gcp_pubsub'
            ? env.CONTROL_PLANE_GCP_PUBSUB_TOPIC
            : undefined
        }
      />

      <ControlPlaneRunsSection runs={overview.runs} pipelines={overview.pipelines} />

      <section className="control-grid">
        <SearchSpaceSection searchSpaces={overview.searchSpaces} />
        <RuntimeProfileSection runtimeProfiles={overview.runtimeProfiles} />
      </section>

      <section className="control-grid">
        <ArtifactDestinationSection artifactDestinations={overview.artifactDestinations} />
        <StructuredOutputSection
          structuredOutputDestinations={overview.structuredOutputDestinations}
        />
      </section>

      <PipelineSection
        pipelines={overview.pipelines}
        searchSpaces={overview.searchSpaces}
        runtimeProfiles={overview.runtimeProfiles}
        artifactDestinations={overview.artifactDestinations}
      />
    </AppShell>
  );
}
