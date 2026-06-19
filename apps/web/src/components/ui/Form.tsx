'use client';

import { cn } from '@/lib/format';

export function Chip({
  active,
  label,
  count,
  onClick,
}: {
  active?: boolean;
  label: string;
  count?: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[13px] font-medium transition-colors focus-ring min-h-11',
        active
          ? 'border-brand-soft bg-brand-soft text-brand'
          : 'border-line bg-surface text-ink-2 hover:border-brand/30 hover:bg-surface-2',
      )}
    >
      {label}
      {count !== undefined && (
        <span className="font-mono text-[11.5px] text-ink-3">{count}</span>
      )}
    </button>
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-[38px] w-full rounded-[10px] border border-line bg-surface px-3.5 text-[13.5px] text-ink placeholder:text-ink-4 focus-ring',
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-[38px] w-full rounded-[10px] border border-line bg-surface px-3.5 text-[13.5px] text-ink focus-ring',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-6 border-b border-line-2" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          role="tab"
          aria-selected={active === tab.id}
          className={cn(
            'touch-target relative pb-3 text-[13.5px] font-semibold transition-colors',
            active === tab.id ? 'text-brand' : 'text-ink-3 hover:text-ink-2',
          )}
        >
          {tab.label}
          {active === tab.id && (
            <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" />
          )}
        </button>
      ))}
    </div>
  );
}
