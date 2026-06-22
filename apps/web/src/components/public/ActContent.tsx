'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Tabs } from '@/components/ui/Form';
import { cn, formatDate } from '@/lib/format';
import { unitIndentClass, UNIT_TYPE_LABELS } from '@/lib/unit-hierarchy';
import type { ActDetail, NormativeUnit, UnitType } from '@/lib/types';

function noteVariant(nota: string | null): 'warn' | 'danger' | 'ok' | 'neutral' {
  if (!nota) return 'neutral';
  if (nota.toLowerCase().includes('revogado')) return 'danger';
  if (nota.toLowerCase().includes('incluído')) return 'ok';
  return 'warn';
}

const STRUCTURAL_TYPES: UnitType[] = ['titulo', 'capitulo', 'livro', 'secao', 'subsecao'];

function UnitBlock({
  unit,
  mode,
}: {
  unit: NormativeUnit;
  mode: 'consolidado' | 'original' | 'historico';
}) {
  const isStructural = STRUCTURAL_TYPES.includes(unit.tipoUnidade);
  const isPreamble = unit.tipoUnidade === 'preambulo';
  const isRevoked = unit.status === 'revogada';
  const isIncluded = unit.status === 'incluida';
  const isAltered = unit.status === 'alterada';

  let texto = unit.texto;
  if (mode === 'original') {
    const original = unit.versoes.find((v) => !v.validoAte) ?? unit.versoes[0];
    if (original) texto = original.texto;
    if (isIncluded) texto = '(dispositivo não constava do texto original)';
    if (isAltered && unit.versoes.length > 0) texto = unit.versoes[0].texto;
  }

  if (mode === 'historico') return null;

  const indent = unitIndentClass(unit.tipoUnidade);
  const anchorId =
    unit.identificacao?.replace(/\s+/g, '-').toLowerCase() ?? `unit-${unit.ordem}`;

  if (isPreamble) {
    return (
      <article id={anchorId} className="legal-body mb-6 text-center italic text-ink-2">
        {texto}
      </article>
    );
  }

  if (isStructural) {
    return (
      <article id={anchorId} className={cn('mb-6', indent)}>
        <h3 className="legal-body text-center text-[15px] font-semibold uppercase tracking-wide text-ink">
          {unit.identificacao && <span className="block">{unit.identificacao}</span>}
          {texto}
        </h3>
        {mode === 'consolidado' && unit.nota && (
          <div className="mt-2 text-center">
            <Badge variant={noteVariant(unit.nota)}>{unit.nota}</Badge>
          </div>
        )}
      </article>
    );
  }

  if (unit.tipoUnidade === 'ementa') return null;

  const showLabel = ['artigo', 'paragrafo', 'inciso', 'alinea', 'item'].includes(unit.tipoUnidade);
  const label = unit.identificacao ?? UNIT_TYPE_LABELS[unit.tipoUnidade];

  return (
    <article
      id={anchorId}
      className={cn('mb-4', indent, isRevoked && mode === 'consolidado' && 'opacity-80')}
    >
      <p className="legal-body text-ink">
        {showLabel && label && (
          <strong
            className={cn(
              unit.tipoUnidade === 'artigo' && 'mr-1',
              isRevoked && mode === 'consolidado' && 'text-ink-4 line-through',
            )}
          >
            {unit.tipoUnidade === 'inciso' ? `${label} –` : label}
          </strong>
        )}
        <span className={cn(isRevoked && mode === 'consolidado' && 'text-ink-4 line-through')}>
          {showLabel && label ? ' ' : ''}
          {texto}
        </span>
      </p>
      {mode === 'consolidado' && unit.nota && (
        <div className="mt-2">
          <Badge variant={noteVariant(unit.nota)}>{unit.nota}</Badge>
        </div>
      )}
    </article>
  );
}

export function ActContent({ act }: { act: ActDetail }) {
  const [tab, setTab] = useState('consolidado');
  const articles = act.units.filter(
    (u) => u.tipoUnidade === 'artigo' && u.identificacao,
  );

  return (
    <div>
      <Tabs
        tabs={[
          { id: 'consolidado', label: 'Texto consolidado' },
          { id: 'original', label: 'Texto original' },
          { id: 'historico', label: 'Histórico de alterações' },
        ]}
        active={tab}
        onChange={setTab}
      />

      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_1fr]">
        {tab !== 'historico' && (
          <>
            <details className="no-print rounded-[10px] border border-line bg-surface p-3 lg:hidden">
              <summary className="touch-target cursor-pointer text-[13px] font-semibold text-ink">
                Sumário ({articles.length} artigos)
              </summary>
              <ul className="mt-2 space-y-1">
                {articles.map((u) => (
                  <li key={u.id}>
                    <a
                      href={`#${u.identificacao?.replace(/\s+/g, '-').toLowerCase()}`}
                      className="touch-target block rounded-[8px] px-2 py-2 font-mono text-[12px] text-ink-3 hover:bg-brand-soft hover:text-brand"
                    >
                      {u.identificacao}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
            <nav className="no-print sticky top-20 hidden h-fit lg:block" aria-label="Sumário do ato">
              <p className="text-section mb-3">Sumário</p>
              <ul className="space-y-1">
                {articles.map((u) => (
                  <li key={u.id}>
                    <a
                      href={`#${u.identificacao?.replace(/\s+/g, '-').toLowerCase()}`}
                      className="block rounded-[8px] px-2 py-1.5 font-mono text-[12px] text-ink-3 hover:bg-brand-soft hover:text-brand"
                    >
                      {u.identificacao}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </>
        )}

        <div className={tab === 'historico' ? 'lg:col-span-2' : ''}>
          {tab === 'historico' ? (
            <ol className="relative space-y-6 border-l-2 border-line pl-6">
              <li>
                <span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-brand bg-surface" />
                <p className="font-mono text-[12px] text-ink-3">{formatDate(act.dataPublicacao)}</p>
                <p className="mt-1 font-semibold text-ink">Publicação original</p>
                <p className="text-[13.5px] text-ink-2">{act.codigo}</p>
              </li>
              {act.history.map((h) => (
                <li key={h.id}>
                  <span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-warn bg-surface" />
                  <p className="font-mono text-[12px] text-ink-3">{formatDate(h.data)}</p>
                  <p className="mt-1 font-semibold text-ink">{h.nota ?? h.tipoAlteracao}</p>
                  {h.dispositivo && (
                    <p className="text-[13px] text-ink-2">Dispositivo: {h.dispositivo}</p>
                  )}
                  {h.normaAlteradora && (
                    <p className="font-mono text-[12.5px] text-brand">{h.normaAlteradora.codigo}</p>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            act.units.map((unit) => (
              <UnitBlock
                key={unit.id}
                unit={unit}
                mode={tab as 'consolidado' | 'original'}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
