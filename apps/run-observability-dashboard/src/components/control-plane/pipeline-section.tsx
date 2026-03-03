import type {
  ArtifactDestination,
  Pipeline,
  RuntimeProfile,
  SearchSpace,
} from '@repo/control-plane-contracts';
import { DisclosurePanel } from '@/components/control-plane/disclosure-panel';
import { SectionHeading } from '@/components/control-plane/section-heading';
import { ResourceLifecycleActions } from '@/components/control-plane/resource-lifecycle-actions';
import {
  archivePipelineAction,
  createPipelineAction,
  deletePipelineAction,
  updatePipelineAction,
} from '@/app/control-plane/actions';

type PipelineSectionProps = {
  pipelines: Pipeline[];
  searchSpaces: SearchSpace[];
  runtimeProfiles: RuntimeProfile[];
  artifactDestinations: ArtifactDestination[];
};

export function PipelineSection({
  pipelines,
  searchSpaces,
  runtimeProfiles,
  artifactDestinations,
}: PipelineSectionProps) {
  return (
    <section className="panel">
      <SectionHeading
        eyebrow="Pipelines"
        title="Run definitions"
        description="Pipelines bind a search space, runtime profile, artifact destination, and optional structured sinks into a versioned manifest source."
        detail={`${pipelines.length} total`}
      />
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>SEARCH SPACE</th>
              <th>MODE</th>
              <th>SINKS</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {pipelines.map((pipeline) => (
              <tr key={pipeline.id}>
                <td>{pipeline.id}</td>
                <td>{pipeline.searchSpaceId}</td>
                <td>{pipeline.mode}</td>
                <td>
                  {pipeline.structuredOutputDestinationIds.length > 0
                    ? pipeline.structuredOutputDestinationIds.join(', ')
                    : 'none'}
                </td>
                <td>{pipeline.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pipelines.length > 0 ? (
        <DisclosurePanel
          title="Manage pipelines"
          description="Expand to retarget a pipeline or change its delivery mode."
        >
          <div className="resource-edit-grid">
            {pipelines.map((pipeline) => (
              <details key={pipeline.id} className="resource-card">
                <summary>{pipeline.name}</summary>
                <form action={updatePipelineAction} className="control-form">
                  <input type="hidden" name="id" value={pipeline.id} />
                  <label>
                    <span>NAME</span>
                    <input name="name" defaultValue={pipeline.name} required />
                  </label>
                  <div className="control-form__row">
                    <label>
                      <span>SEARCH SPACE</span>
                      <select name="searchSpaceId" required defaultValue={pipeline.searchSpaceId}>
                        {searchSpaces.map((searchSpace) => (
                          <option key={searchSpace.id} value={searchSpace.id}>
                            {searchSpace.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>RUNTIME</span>
                      <select
                        name="runtimeProfileId"
                        required
                        defaultValue={pipeline.runtimeProfileId}
                      >
                        {runtimeProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>ARTIFACT DESTINATION</span>
                      <select
                        name="artifactDestinationId"
                        required
                        defaultValue={pipeline.artifactDestinationId}
                      >
                        {artifactDestinations.map((destination) => (
                          <option key={destination.id} value={destination.id}>
                            {destination.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="control-form__row">
                    <label>
                      <span>MODE</span>
                      <select name="mode" defaultValue={pipeline.mode}>
                        <option value="crawl_and_ingest">crawl_and_ingest</option>
                        <option value="crawl_only">crawl_only</option>
                      </select>
                    </label>
                    <label className="control-form__wide">
                      <span>STRUCTURED OUTPUT IDS</span>
                      <input
                        name="structuredOutputDestinationIds"
                        defaultValue={pipeline.structuredOutputDestinationIds.join(',')}
                      />
                    </label>
                  </div>
                  <button type="submit">Save pipeline</button>
                </form>
                <ResourceLifecycleActions
                  id={pipeline.id}
                  archiveAction={archivePipelineAction}
                  deleteAction={deletePipelineAction}
                />
              </details>
            ))}
          </div>
        </DisclosurePanel>
      ) : null}

      <DisclosurePanel
        title="Create pipeline"
        description="Assemble a source definition, runtime profile, artifact destination, and optional sinks into one runnable manifest source."
        defaultOpen
        testId="create-pipeline-disclosure"
      >
        <form action={createPipelineAction} className="control-form">
          <label>
            <span>NAME</span>
            <input
              name="name"
              placeholder="Prague jobs local pipeline"
              required
              data-testid="pipeline-name-input"
            />
          </label>
          <div className="control-form__row">
            <label>
              <span>SEARCH SPACE</span>
              <select name="searchSpaceId" required defaultValue={searchSpaces[0]?.id}>
                {searchSpaces.map((searchSpace) => (
                  <option key={searchSpace.id} value={searchSpace.id}>
                    {searchSpace.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>RUNTIME</span>
              <select name="runtimeProfileId" required defaultValue={runtimeProfiles[0]?.id}>
                {runtimeProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>ARTIFACT DESTINATION</span>
              <select
                name="artifactDestinationId"
                required
                defaultValue={artifactDestinations[0]?.id}
              >
                {artifactDestinations.map((destination) => (
                  <option key={destination.id} value={destination.id}>
                    {destination.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="control-form__row">
            <label>
              <span>MODE</span>
              <select name="mode" defaultValue="crawl_and_ingest">
                <option value="crawl_and_ingest">crawl_and_ingest</option>
                <option value="crawl_only">crawl_only</option>
              </select>
            </label>
            <label className="control-form__wide">
              <span>STRUCTURED OUTPUT IDS</span>
              <input
                name="structuredOutputDestinationIds"
                placeholder="local-json-output,mongo-normalized-jobs"
              />
            </label>
          </div>
          <button type="submit" data-testid="create-pipeline-submit">
            Create pipeline
          </button>
        </form>
      </DisclosurePanel>
    </section>
  );
}
