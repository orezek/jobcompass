import type { ReactNode } from 'react';

export function DisclosurePanel({
  title,
  description,
  children,
  defaultOpen = false,
  testId,
}: {
  title: string;
  description: string;
  children: ReactNode;
  defaultOpen?: boolean;
  testId?: string;
}) {
  return (
    <details className="operator-disclosure" open={defaultOpen} data-testid={testId}>
      <summary className="operator-disclosure__summary">
        <span className="operator-disclosure__title">{title}</span>
        <span className="operator-disclosure__description">{description}</span>
      </summary>
      <div className="operator-disclosure__body">{children}</div>
    </details>
  );
}
