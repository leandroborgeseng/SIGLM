import { cn } from '@/lib/format';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'filled' | 'tonal' | 'outlined' | 'ghost' | 'danger';
type Size = 'md' | 'sm' | 'xs';

const variants: Record<Variant, string> = {
  filled: 'bg-brand text-white hover:bg-brand-hover border-transparent',
  tonal: 'bg-brand-soft text-brand hover:bg-brand-soft/80 border-transparent',
  outlined: 'bg-surface text-ink-2 border-line hover:border-brand hover:text-brand',
  ghost: 'bg-transparent text-ink-2 border-transparent hover:bg-surface-2 hover:text-brand',
  danger: 'bg-danger text-white hover:bg-danger/90 border-transparent',
};

const sizes: Record<Size, string> = {
  md: 'h-[38px] px-4 text-[13.5px]',
  sm: 'h-9 px-3.5 text-[13px]',
  xs: 'h-[34px] px-3 text-[12.5px]',
};

export function Button({
  variant = 'filled',
  size = 'md',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-[10px] border font-semibold transition-colors duration-200 focus-ring disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-line bg-surface text-ink-3 transition-colors hover:border-brand hover:text-brand focus-ring',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
