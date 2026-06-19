import { cn } from '@/lib/format';
import type { ActSituacao } from '@/lib/types';

const situacaoStyles: Record<
  ActSituacao,
  { dot: string; bg: string; text: string; border: string }
> = {
  vigente: { dot: 'bg-ok', bg: 'bg-ok-bg', text: 'text-ok', border: 'border-ok-bd' },
  consolidado: { dot: 'bg-brand', bg: 'bg-brand-soft', text: 'text-brand', border: 'border-brand-soft' },
  parcialmente_revogado: { dot: 'bg-warn', bg: 'bg-warn-bg', text: 'text-warn', border: 'border-warn-bd' },
  alterado: { dot: 'bg-warn', bg: 'bg-warn-bg', text: 'text-warn', border: 'border-warn-bd' },
  revogado: { dot: 'bg-off', bg: 'bg-muted-bg', text: 'text-muted', border: 'border-line' },
};

export function StatusBadge({
  situacao,
  label,
  className,
}: {
  situacao: ActSituacao;
  label: string;
  className?: string;
}) {
  const s = situacaoStyles[situacao];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold',
        s.bg,
        s.text,
        s.border,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
      {label}
    </span>
  );
}

type BadgeVariant = 'info' | 'warn' | 'danger' | 'ok' | 'neutral';

const badgeVariants: Record<BadgeVariant, string> = {
  info: 'bg-brand-soft text-brand',
  warn: 'bg-warn-bg text-warn',
  danger: 'bg-danger-bg text-danger',
  ok: 'bg-ok-bg text-ok',
  neutral: 'bg-muted-bg text-muted',
};

export function Badge({
  variant = 'neutral',
  children,
  className,
}: {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold',
        badgeVariants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
