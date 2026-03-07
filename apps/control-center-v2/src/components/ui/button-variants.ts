import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-sm border text-[0.72rem] font-medium uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'border-primary bg-primary px-3 py-2 text-primary-foreground hover:bg-primary/90',
        secondary:
          'border-border bg-card px-3 py-2 text-foreground hover:border-foreground/40 hover:bg-card/80',
        ghost:
          'border-transparent bg-transparent px-2 py-2 text-muted-foreground hover:text-foreground',
        danger:
          'border-destructive bg-destructive px-3 py-2 text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        default: 'min-h-10',
        sm: 'min-h-8 px-2.5 py-1.5 text-[0.68rem]',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);
