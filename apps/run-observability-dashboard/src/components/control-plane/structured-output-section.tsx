import type { StructuredOutputDestination } from '@repo/control-plane-contracts';
import { DisclosurePanel } from '@/components/control-plane/disclosure-panel';
import { SectionHeading } from '@/components/control-plane/section-heading';
import { ResourceLifecycleActions } from '@/components/control-plane/resource-lifecycle-actions';
import {
  archiveStructuredOutputDestinationAction,
  createStructuredOutputDestinationAction,
  deleteStructuredOutputDestinationAction,
  updateStructuredOutputDestinationAction,
} from '@/app/control-plane/actions';

type StructuredOutputSectionProps = {
  structuredOutputDestinations: StructuredOutputDestination[];
};

function describeStructuredOutputConfig(destination: StructuredOutputDestination): string {
  if (destination.type === 'local_json' && 'basePath' in destination.config) {
    return destination.config.basePath;
  }

  if (destination.type === 'mongodb' && 'collectionName' in destination.config) {
    return destination.config.collectionName;
  }

  if (destination.type === 'gcs_json' && 'bucket' in destination.config) {
    return `${destination.config.bucket}/${destination.config.prefix ?? ''}`;
  }

  return destination.id;
}

export function StructuredOutputSection({
  structuredOutputDestinations,
}: StructuredOutputSectionProps) {
  return (
    <section className="panel">
      <SectionHeading
        eyebrow="Outputs"
        title="Structured sinks"
        description="V1 keeps MongoDB and local JSON as direct ingestion worker sinks."
        detail={`${structuredOutputDestinations.length} total`}
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
            {structuredOutputDestinations.map((destination) => (
              <tr key={destination.id}>
                <td>{destination.id}</td>
                <td>{destination.type}</td>
                <td>{describeStructuredOutputConfig(destination)}</td>
                <td>{destination.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {structuredOutputDestinations.length > 0 ? (
        <DisclosurePanel
          title="Manage structured sinks"
          description="Expand to edit delivery targets for normalized output."
        >
          <div className="resource-edit-grid">
            {structuredOutputDestinations.map((destination) => (
              <details key={destination.id} className="resource-card">
                <summary>{destination.name}</summary>
                <form action={updateStructuredOutputDestinationAction} className="control-form">
                  <input type="hidden" name="id" value={destination.id} />
                  <label>
                    <span>NAME</span>
                    <input name="name" defaultValue={destination.name} required />
                  </label>
                  <label>
                    <span>TYPE</span>
                    <select name="type" defaultValue={destination.type}>
                      <option value="local_json">local_json</option>
                      <option value="mongodb">mongodb</option>
                      <option value="gcs_json">gcs_json</option>
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
                      <span>COLLECTION</span>
                      <input
                        name="collectionName"
                        defaultValue={
                          'collectionName' in destination.config
                            ? destination.config.collectionName
                            : 'normalized_job_ads'
                        }
                      />
                    </label>
                    <label>
                      <span>CONNECTION REF</span>
                      <input
                        name="connectionRef"
                        defaultValue={
                          'connectionRef' in destination.config
                            ? (destination.config.connectionRef ?? '')
                            : ''
                        }
                      />
                    </label>
                    <label>
                      <span>BUCKET</span>
                      <input
                        name="bucket"
                        defaultValue={
                          'bucket' in destination.config ? destination.config.bucket : ''
                        }
                      />
                    </label>
                  </div>
                  <label>
                    <span>PREFIX</span>
                    <input
                      name="prefix"
                      defaultValue={'prefix' in destination.config ? destination.config.prefix : ''}
                    />
                  </label>
                  <button type="submit">Save structured output</button>
                </form>
                <ResourceLifecycleActions
                  id={destination.id}
                  archiveAction={archiveStructuredOutputDestinationAction}
                  deleteAction={deleteStructuredOutputDestinationAction}
                />
              </details>
            ))}
          </div>
        </DisclosurePanel>
      ) : null}

      <DisclosurePanel
        title="Create structured sink"
        description="Register MongoDB, local JSON, or GCS JSON as a reusable normalized output target."
      >
        <form action={createStructuredOutputDestinationAction} className="control-form">
          <label>
            <span>NAME</span>
            <input name="name" placeholder="Local normalized JSON" required />
          </label>
          <label>
            <span>TYPE</span>
            <select name="type" defaultValue="local_json">
              <option value="local_json">local_json</option>
              <option value="mongodb">mongodb</option>
              <option value="gcs_json">gcs_json</option>
            </select>
          </label>
          <label>
            <span>BASE PATH</span>
            <input name="basePath" defaultValue="../jobs-ingestion-service/output/control-plane" />
          </label>
          <label>
            <span>COLLECTION</span>
            <input name="collectionName" defaultValue="normalized_job_ads" />
          </label>
          <label>
            <span>CONNECTION REF</span>
            <input name="connectionRef" defaultValue="env:MONGODB_URI" />
          </label>
          <div className="control-form__row">
            <label>
              <span>BUCKET</span>
              <input name="bucket" placeholder="jobcompass-output" />
            </label>
            <label className="control-form__wide">
              <span>PREFIX</span>
              <input name="prefix" placeholder="output/dev" />
            </label>
          </div>
          <button type="submit">Create structured output</button>
        </form>
      </DisclosurePanel>
    </section>
  );
}
