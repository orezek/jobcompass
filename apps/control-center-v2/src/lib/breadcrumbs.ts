export type BreadcrumbItem = {
  href: string;
  label: string;
};

const labelMap = new Map<string, string>([
  ['pipelines', 'Pipelines'],
  ['runs', 'Runs'],
  ['new', 'Create Pipeline'],
]);

const segmentLabel = (segment: string): string => {
  if (labelMap.has(segment)) {
    return labelMap.get(segment)!;
  }

  if (/^[a-z0-9-]+$/i.test(segment)) {
    return segment;
  }

  return segment.replace(/[-_]/g, ' ');
};

export const buildBreadcrumbs = (pathname: string): BreadcrumbItem[] => {
  const segments = pathname.split('/').filter(Boolean);
  const items: BreadcrumbItem[] = [{ href: '/pipelines', label: 'Pipelines' }];

  if (segments.length === 0) {
    return items;
  }

  let currentPath = '';
  const breadcrumbs: BreadcrumbItem[] = [];
  for (const segment of segments) {
    currentPath += `/${segment}`;
    breadcrumbs.push({ href: currentPath, label: segmentLabel(segment) });
  }

  return breadcrumbs;
};
