import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-sm border px-2 py-1 font-mono text-[0.68rem] uppercase tracking-[0.14em]',
  {
    variants: {
      variant: {
        neutral: 'border-border bg-card text-muted-foreground',
        running: 'border-primary/60 bg-primary/15 text-foreground',
        success: 'border-success/70 bg-success/20 text-success-foreground',
        warning: 'border-warning/70 bg-warning/20 text-warning-foreground',
        danger: 'border-destructive/70 bg-destructive/20 text-destructive-foreground',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
