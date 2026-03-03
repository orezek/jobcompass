import type { SearchSpace } from '@repo/control-plane-contracts';
import { DisclosurePanel } from '@/components/control-plane/disclosure-panel';
import { SectionHeading } from '@/components/control-plane/section-heading';
import { ResourceLifecycleActions } from '@/components/control-plane/resource-lifecycle-actions';
import {
  archiveSearchSpaceAction,
  createSearchSpaceAction,
  deleteSearchSpaceAction,
  updateSearchSpaceAction,
} from '@/app/control-plane/actions';

type SearchSpaceSectionProps = {
  searchSpaces: SearchSpace[];
};

export function SearchSpaceSection({ searchSpaces }: SearchSpaceSectionProps) {
  return (
    <section className="panel">
      <SectionHeading
        eyebrow="Search spaces"
        title="Source definitions"
        description="Bootstrapped from the current crawler configs and editable through the control plane."
        detail={`${searchSpaces.length} total`}
      />
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>START URLS</th>
              <th>MAX ITEMS</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {searchSpaces.map((searchSpace) => (
              <tr key={searchSpace.id}>
                <td>{searchSpace.id}</td>
                <td>{searchSpace.startUrls.length}</td>
                <td>{searchSpace.maxItemsDefault}</td>
                <td>{searchSpace.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {searchSpaces.length > 0 ? (
        <DisclosurePanel
          title="Manage source definitions"
          description="Expand to edit or retire an existing search space."
        >
          <div className="resource-edit-grid">
            {searchSpaces.map((searchSpace) => (
              <details key={searchSpace.id} className="resource-card">
                <summary>{searchSpace.name}</summary>
                <form action={updateSearchSpaceAction} className="control-form">
                  <input type="hidden" name="id" value={searchSpace.id} />
                  <label>
                    <span>NAME</span>
                    <input name="name" defaultValue={searchSpace.name} required />
                  </label>
                  <label>
                    <span>DESCRIPTION</span>
                    <textarea name="description" rows={3} defaultValue={searchSpace.description} />
                  </label>
                  <label>
                    <span>START URLS</span>
                    <textarea
                      name="startUrls"
                      rows={4}
                      defaultValue={searchSpace.startUrls.join('\n')}
                      required
                    />
                  </label>
                  <div className="control-form__row">
                    <label>
                      <span>MAX ITEMS</span>
                      <input
                        name="maxItemsDefault"
                        type="number"
                        min="1"
                        defaultValue={searchSpace.maxItemsDefault}
                        required
                      />
                    </label>
                  </div>
                  <label className="checkbox-row">
                    <input
                      name="allowInactiveMarkingOnPartialRuns"
                      type="checkbox"
                      defaultChecked={searchSpace.allowInactiveMarkingOnPartialRuns}
                    />
                    <span>Allow inactive marking on partial runs</span>
                  </label>
                  <button type="submit">Save search space</button>
                </form>
                <ResourceLifecycleActions
                  id={searchSpace.id}
                  archiveAction={archiveSearchSpaceAction}
                  deleteAction={deleteSearchSpaceAction}
                />
              </details>
            ))}
          </div>
        </DisclosurePanel>
      ) : null}

      <DisclosurePanel
        title="Create source definition"
        description="Add a new list-page crawl target without changing runtime throughput."
      >
        <form action={createSearchSpaceAction} className="control-form">
          <label>
            <span>NAME</span>
            <input name="name" placeholder="Prague backend daily" required />
          </label>
          <label>
            <span>DESCRIPTION</span>
            <textarea name="description" rows={3} />
          </label>
          <label>
            <span>START URLS</span>
            <textarea
              name="startUrls"
              rows={4}
              placeholder="https://www.jobs.cz/prace/praha/"
              required
            />
          </label>
          <div className="control-form__row">
            <label>
              <span>MAX ITEMS</span>
              <input name="maxItemsDefault" type="number" min="1" defaultValue="100" required />
            </label>
          </div>
          <label className="checkbox-row">
            <input name="allowInactiveMarkingOnPartialRuns" type="checkbox" />
            <span>Allow inactive marking on partial runs</span>
          </label>
          <button type="submit">Create search space</button>
        </form>
      </DisclosurePanel>
    </section>
  );
}
