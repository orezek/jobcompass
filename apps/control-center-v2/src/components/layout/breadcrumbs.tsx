'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { buildBreadcrumbs } from '@/lib/breadcrumbs';

export function Breadcrumbs() {
  const pathname = usePathname();
  const items = buildBreadcrumbs(pathname);

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground"
    >
      {items.map((item, index) => (
        <span key={item.href} className="flex items-center gap-2">
          {index > 0 ? <span>/</span> : null}
          <Link href={item.href} className="hover:text-foreground">
            {item.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}
