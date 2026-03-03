import type { ArtifactDestination } from '@repo/control-plane-contracts';
import { DisclosurePanel } from '@/components/control-plane/disclosure-panel';
import { SectionHeading } from '@/components/control-plane/section-heading';
import { ResourceLifecycleActions } from '@/components/control-plane/resource-lifecycle-actions';
import {
  archiveArtifactDestinationAction,
  createArtifactDestinationAction,
  deleteArtifactDestinationAction,
  updateArtifactDestinationAction,
} from '@/app/control-plane/actions';

type ArtifactDestinationSectionProps = {
  artifactDestinations: ArtifactDestination[];
};

function describeArtifactConfig(destination: ArtifactDestination): string {
  return 'basePath' in destination.config
    ? destination.config.basePath
    : `${destination.config.bucket}/${destination.config.prefix ?? ''}`;
}

export function ArtifactDestinationSection({
  artifactDestinations,
}: ArtifactDestinationSectionProps) {
  return (
    <section className="panel">
      <SectionHeading
        eyebrow="Destinations"
        title="Artifact storage"
        description="V1 local execution writes HTML artifacts to local filesystem roots while preserving the current run-based layout."
        detail={`${artifactDestinations.length} total`}
      />
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>TYPE</th>
              <th>CONFIG</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {artifactDestinations.map((destination) => (
              <tr key={destination.id}>
                <td>{destination.id}</td>
                <td>{destination.type}</td>
                <td>{describeArtifactConfig(destination)}</td>
                <td>{destination.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {artifactDestinations.length > 0 ? (
        <DisclosurePanel
          title="Manage artifact destinations"
          description="Expand to edit storage roots or retire a destination safely."
        >
          <div className="resource-edit-grid">
            {artifactDestinations.map((destination) => (
              <details key={destination.id} className="resource-card">
                <summary>{destination.name}</summary>
                <form action={updateArtifactDestinationAction} className="control-form">
                  <input type="hidden" name="id" value={destination.id} />
                  <label>
                    <span>NAME</span>
                    <input name="name" defaultValue={destination.name} required />
                  </label>
                  <label>
                    <span>TYPE</span>
                    <select name="type" defaultValue={destination.type}>
                      <option value="local_filesystem">local_filesystem</option>
                      <option value="gcs">gcs</option>
                    </select>
                  </label>
                  <label>
                    <span>BASE PATH</span>
                    <input
                      name="basePath"
                      defaultValue={
                        'basePath' in destination.config ? destination.config.basePath : ''
                      }
                    />
                  </label>
                  <div className="control-form__row">
                    <label>
                      <span>BUCKET</span>
                      <input
                        name="bucket"
                        defaultValue={
                          'bucket' in destination.config ? destination.config.bucket : ''
                        }
                      />
                    </label>
                    <label className="control-form__wide">
                      <span>PREFIX</span>
                      <input
                        name="prefix"
                        defaultValue={
                          'prefix' in destination.config ? destination.config.prefix : ''
                        }
                      />
                    </label>
                  </div>
                  <button type="submit">Save artifact destination</button>
                </form>
                <ResourceLifecycleActions
                  id={destination.id}
                  archiveAction={archiveArtifactDestinationAction}
                  deleteAction={deleteArtifactDestinationAction}
                />
              </details>
            ))}
          </div>
        </DisclosurePanel>
      ) : null}

      <DisclosurePanel
        title="Create artifact destination"
        description="Register a reusable storage target for raw HTML dumps."
      >
        <form action={createArtifactDestinationAction} className="control-form">
          <label>
            <span>NAME</span>
            <input name="name" placeholder="Local HTML storage" required />
          </label>
          <label>
            <span>TYPE</span>
            <select name="type" defaultValue="local_filesystem">
              <option value="local_filesystem">local_filesystem</option>
              <option value="gcs">gcs</option>
            </select>
          </label>
          <label>
            <span>BASE PATH</span>
            <input name="basePath" defaultValue="../jobs-ingestion-service/scrapped_jobs" />
          </label>
          <div className="control-form__row">
            <label>
              <span>BUCKET</span>
              <input name="bucket" placeholder="jobcompass-artifacts" />
            </label>
            <label className="control-form__wide">
              <span>PREFIX</span>
              <input name="prefix" placeholder="artifacts/dev" />
            </label>
          </div>
          <button type="submit">Create artifact destination</button>
        </form>
      </DisclosurePanel>
    </section>
  );
}
