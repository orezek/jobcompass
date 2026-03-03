import { formatCompactBytes } from '@/server/lib/formatting';
import type { ControlPlaneFilePreview } from '@/server/control-plane/file-previews';
import { SectionHeading } from '@/components/control-plane/section-heading';

export function FilePreviewPanel({
  eyebrow,
  title,
  preview,
  emptyCopy,
}: {
  eyebrow: string;
  title: string;
  preview: ControlPlaneFilePreview | null;
  emptyCopy: string;
}) {
  return (
    <section className="panel">
      <SectionHeading eyebrow={eyebrow} title={title} description="" />
      {preview?.exists && preview.contents ? (
        <>
          <p className="empty-copy">
            {preview.path}
            {preview.sizeBytes ? ` • ${formatCompactBytes(preview.sizeBytes)} bytes` : ''}
            {preview.truncated ? ' • preview truncated' : ''}
          </p>
          <pre className="code-panel">{preview.contents}</pre>
        </>
      ) : (
        <p className="empty-copy">{emptyCopy}</p>
      )}
    </section>
  );
}
