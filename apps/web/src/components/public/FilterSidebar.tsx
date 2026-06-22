'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useTransition } from 'react';
import { Chip } from '@/components/ui/Form';
import { AdvancedFilters } from '@/components/public/AdvancedFilters';
import { ACT_TYPE_LABELS, ACT_TYPES, SITUACAO_LABELS, SITUACOES } from '@/lib/format';
import type { FilterCounts } from '@/lib/types';

export function FilterSidebar({
  counts,
  onChange,
}: {
  counts: FilterCounts;
  onChange?: () => void;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const tipo = params.get('tipo') ?? '';
  const situacao = params.get('situacao') ?? '';
  const ano = params.get('ano') ?? '';
  const numero = params.get('numero') ?? '';
  const assunto = params.get('assunto') ?? '';
  const publicadoDe = params.get('publicadoDe') ?? '';
  const publicadoAte = params.get('publicadoAte') ?? '';
  const anos = Object.keys(counts.anos ?? {})
    .map(Number)
    .sort((a, b) => b - a);

  const update = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      Object.entries(updates).forEach(([k, v]) => {
        if (v) next.set(k, v);
        else next.delete(k);
      });
      next.delete('page');
      startTransition(() => {
        router.push(`/legislacao?${next.toString()}`);
        onChange?.();
      });
    },
    [params, router, onChange],
  );

  return (
    <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start" aria-label="Filtros">
      <div>
        <h2 className="text-section mb-3">Tipo do ato</h2>
        <div className="flex flex-col gap-2">
          <Chip active={!tipo} label="Todos" count={counts.total} onClick={() => update({ tipo: null })} />
          {ACT_TYPES.map((t) => (
            <Chip
              key={t}
              active={tipo === t}
              label={ACT_TYPE_LABELS[t]}
              count={counts.tipos[t] ?? 0}
              onClick={() => update({ tipo: tipo === t ? null : t })}
            />
          ))}
        </div>
      </div>
      {anos.length > 0 && (
        <div>
          <h2 className="text-section mb-3">Ano</h2>
          <div className="flex flex-wrap gap-2">
            <Chip active={!ano} label="Todos" onClick={() => update({ ano: null })} />
            {anos.map((y) => (
              <Chip
                key={y}
                active={ano === String(y)}
                label={String(y)}
                count={counts.anos?.[y] ?? 0}
                onClick={() => update({ ano: ano === String(y) ? null : String(y) })}
              />
            ))}
          </div>
        </div>
      )}
      <div>
        <h2 className="text-section mb-3">Situação</h2>
        <div className="flex flex-col gap-2">
          <Chip
            active={!situacao}
            label="Todas"
            count={counts.total}
            onClick={() => update({ situacao: null })}
          />
          {SITUACOES.map((s) => (
            <Chip
              key={s}
              active={situacao === s}
              label={SITUACAO_LABELS[s]}
              count={counts.situacoes[s] ?? 0}
              onClick={() => update({ situacao: situacao === s ? null : s })}
            />
          ))}
        </div>
      </div>
      <AdvancedFilters
        numero={numero}
        assunto={assunto}
        publicadoDe={publicadoDe}
        publicadoAte={publicadoAte}
        onChange={update}
      />
      {pending && <p className="text-[12px] text-ink-4" role="status">Atualizando...</p>}
    </aside>
  );
}
