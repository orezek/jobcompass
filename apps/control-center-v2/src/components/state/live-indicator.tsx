import { cn } from '@/lib/utils';
import type { LiveConnectionState } from '@/lib/live';

const stateStyles: Record<LiveConnectionState, { label: string; dot: string }> = {
  connecting: { label: 'Connecting', dot: 'bg-warning' },
  live: { label: 'Live', dot: 'bg-success' },
  stale: { label: 'Stale', dot: 'bg-destructive' },
};

export function LiveIndicator({
  state,
  className,
}: {
  state: LiveConnectionState;
  className?: string;
}) {
  const current = stateStyles[state];
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground',
        className,
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', current.dot)} />
      <span>{current.label}</span>
    </div>
  );
}
