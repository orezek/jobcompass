import { Badge } from '@/components/ui/badge';
import { titleCaseFromToken } from '@/lib/utils';

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return <Badge variant="neutral">Disabled</Badge>;
  }

  if (status === 'running' || status === 'queued') {
    return <Badge variant="running">{titleCaseFromToken(status)}</Badge>;
  }

  if (status === 'succeeded') {
    return <Badge variant="success">Succeeded</Badge>;
  }

  if (status === 'completed_with_errors') {
    return <Badge variant="warning">Completed With Errors</Badge>;
  }

  if (status === 'failed' || status === 'stopped') {
    return <Badge variant="danger">{titleCaseFromToken(status)}</Badge>;
  }

  return <Badge variant="neutral">{titleCaseFromToken(status)}</Badge>;
}
