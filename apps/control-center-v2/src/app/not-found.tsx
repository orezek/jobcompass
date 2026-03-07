import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 rounded-sm border border-border bg-card p-6">
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
        Missing Surface
      </p>
      <h2 className="text-2xl font-semibold tracking-tightest">
        The requested control surface was not found.
      </h2>
      <p className="text-sm text-muted-foreground">
        Return to the pipeline list and continue from the current operator scope.
      </p>
      <div>
        <Button asChild>
          <Link href="/pipelines">Go To Pipelines</Link>
        </Button>
      </div>
    </div>
  );
}
