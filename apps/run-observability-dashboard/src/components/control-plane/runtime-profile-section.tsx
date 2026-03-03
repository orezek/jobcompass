import type { RuntimeProfile } from '@repo/control-plane-contracts';
import { DisclosurePanel } from '@/components/control-plane/disclosure-panel';
import { SectionHeading } from '@/components/control-plane/section-heading';
import { ResourceLifecycleActions } from '@/components/control-plane/resource-lifecycle-actions';
import {
  archiveRuntimeProfileAction,
  createRuntimeProfileAction,
  deleteRuntimeProfileAction,
  updateRuntimeProfileAction,
} from '@/app/control-plane/actions';

type RuntimeProfileSectionProps = {
  runtimeProfiles: RuntimeProfile[];
};

export function RuntimeProfileSection({ runtimeProfiles }: RuntimeProfileSectionProps) {
  return (
    <section className="panel">
      <SectionHeading
        eyebrow="Runtime profiles"
        title="Execution settings"
        description="Separate crawler throughput from artifact and sink configuration."
        detail={`${runtimeProfiles.length} total`}
      />
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>CRAWLER</th>
              <th>INGESTION</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {runtimeProfiles.map((profile) => (
              <tr key={profile.id}>
                <td>{profile.id}</td>
                <td>
                  {profile.crawlerMaxConcurrency} / {profile.crawlerMaxRequestsPerMinute}
                </td>
                <td>{profile.ingestionEnabled ? 'enabled' : 'disabled'}</td>
                <td>{profile.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {runtimeProfiles.length > 0 ? (
        <DisclosurePanel
          title="Manage execution settings"
          description="Expand to tune crawler rate and ingestion concurrency."
        >
          <div className="resource-edit-grid">
            {runtimeProfiles.map((profile) => (
              <details key={profile.id} className="resource-card">
                <summary>{profile.name}</summary>
                <form action={updateRuntimeProfileAction} className="control-form">
                  <input type="hidden" name="id" value={profile.id} />
                  <label>
                    <span>NAME</span>
                    <input name="name" defaultValue={profile.name} required />
                  </label>
                  <div className="control-form__row">
                    <label>
                      <span>CRAWLER CONCURRENCY</span>
                      <input
                        name="crawlerMaxConcurrency"
                        type="number"
                        min="1"
                        defaultValue={profile.crawlerMaxConcurrency}
                        required
                      />
                    </label>
                    <label>
                      <span>REQ/MIN</span>
                      <input
                        name="crawlerMaxRequestsPerMinute"
                        type="number"
                        min="1"
                        defaultValue={profile.crawlerMaxRequestsPerMinute}
                        required
                      />
                    </label>
                    <label>
                      <span>INGESTION CONCURRENCY</span>
                      <input
                        name="ingestionConcurrency"
                        type="number"
                        min="1"
                        defaultValue={profile.ingestionConcurrency}
                        required
                      />
                    </label>
                  </div>
                  <label className="checkbox-row">
                    <input
                      name="ingestionEnabled"
                      type="checkbox"
                      defaultChecked={profile.ingestionEnabled}
                    />
                    <span>Enable ingestion</span>
                  </label>
                  <label className="checkbox-row">
                    <input name="debugLog" type="checkbox" defaultChecked={profile.debugLog} />
                    <span>Enable verbose crawler logging</span>
                  </label>
                  <button type="submit">Save runtime profile</button>
                </form>
                <ResourceLifecycleActions
                  id={profile.id}
                  archiveAction={archiveRuntimeProfileAction}
                  deleteAction={deleteRuntimeProfileAction}
                />
              </details>
            ))}
          </div>
        </DisclosurePanel>
      ) : null}

      <DisclosurePanel
        title="Create execution settings"
        description="Define how aggressively the crawler and ingestion workers run."
      >
        <form action={createRuntimeProfileAction} className="control-form">
          <label>
            <span>NAME</span>
            <input name="name" placeholder="Daily local crawl" required />
          </label>
          <div className="control-form__row">
            <label>
              <span>CRAWLER CONCURRENCY</span>
              <input name="crawlerMaxConcurrency" type="number" min="1" defaultValue="1" required />
            </label>
            <label>
              <span>REQ/MIN</span>
              <input
                name="crawlerMaxRequestsPerMinute"
                type="number"
                min="1"
                defaultValue="30"
                required
              />
            </label>
            <label>
              <span>INGESTION CONCURRENCY</span>
              <input name="ingestionConcurrency" type="number" min="1" defaultValue="1" required />
            </label>
          </div>
          <label className="checkbox-row">
            <input name="ingestionEnabled" type="checkbox" defaultChecked />
            <span>Enable ingestion</span>
          </label>
          <label className="checkbox-row">
            <input name="debugLog" type="checkbox" />
            <span>Enable verbose crawler logging</span>
          </label>
          <button type="submit">Create runtime profile</button>
        </form>
      </DisclosurePanel>
    </section>
  );
}
