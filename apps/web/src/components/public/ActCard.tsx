import Link from 'next/link';
import { StatusBadge } from '@/components/ui/Badge';
import { actUrl, formatDate, SITUACAO_LABELS } from '@/lib/format';
import type { ActSummary } from '@/lib/types';

export function ActCard({ act }: { act: ActSummary }) {
  return (
    <Link
      href={actUrl(act.slug)}
      className="group block rounded-[14px] border border-line bg-surface p-5 shadow-sm transition-all hover:border-brand hover:shadow-md"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-brand">{act.codigo}</span>
        <StatusBadge situacao={act.situacao} label={SITUACAO_LABELS[act.situacao]} />
      </div>
      <p className="mb-3 line-clamp-2 text-[14px] leading-snug text-ink">{act.ementa}</p>
      {act.snippet && (
        <p
          className="mb-3 line-clamp-3 text-[13px] leading-relaxed text-ink-2 [&_mark]:rounded-[3px] [&_mark]:bg-brand-soft [&_mark]:px-0.5 [&_mark]:font-medium [&_mark]:text-brand"
          dangerouslySetInnerHTML={{ __html: act.snippet }}
        />
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
        <span>Publicação: <span className="font-mono">{formatDate(act.dataPublicacao)}</span></span>
        {act.orgaoOrigem && <span>{act.orgaoOrigem}</span>}
      </div>
    </Link>
  );
}
