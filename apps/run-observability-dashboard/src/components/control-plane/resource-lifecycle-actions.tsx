type ResourceLifecycleActionsProps = {
  id: string;
  archiveAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
};

export function ResourceLifecycleActions({
  id,
  archiveAction,
  deleteAction,
}: ResourceLifecycleActionsProps) {
  return (
    <div className="resource-card__actions">
      <form action={archiveAction}>
        <input type="hidden" name="id" value={id} />
        <button type="submit">Archive</button>
      </form>
      <form action={deleteAction}>
        <input type="hidden" name="id" value={id} />
        <button type="submit">Delete</button>
      </form>
    </div>
  );
}
