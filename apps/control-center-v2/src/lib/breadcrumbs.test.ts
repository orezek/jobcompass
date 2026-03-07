import { describe, expect, it } from 'vitest';
import { buildBreadcrumbs } from '@/lib/breadcrumbs';

describe('buildBreadcrumbs', () => {
  it('defaults the root breadcrumb to pipelines', () => {
    expect(buildBreadcrumbs('/')).toEqual([{ href: '/pipelines', label: 'Pipelines' }]);
  });

  it('maps known static segments to operator labels', () => {
    expect(buildBreadcrumbs('/pipelines/new')).toEqual([
      { href: '/pipelines', label: 'Pipelines' },
      { href: '/pipelines/new', label: 'Create Pipeline' },
    ]);
  });

  it('keeps dynamic identifiers readable for detail routes', () => {
    expect(buildBreadcrumbs('/runs/run-123')).toEqual([
      { href: '/runs', label: 'Runs' },
      { href: '/runs/run-123', label: 'run-123' },
    ]);
  });
});
