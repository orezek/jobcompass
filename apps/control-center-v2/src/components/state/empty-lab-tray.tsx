import { cn } from '@/lib/utils';

export function EmptyLabTray({
  title,
  description,
  className,
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-sm border border-dashed border-border bg-transparent p-6 text-center font-mono text-sm uppercase tracking-[0.14em] text-muted-foreground',
        className,
      )}
    >
      <div className="text-foreground">{title}</div>
      <p className="mt-2 text-[0.72rem] normal-case tracking-normal text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
