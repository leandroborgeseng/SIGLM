'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FrancaMark } from '@/components/brand/FrancaMark';
import { getApiBaseUrl } from '@/lib/api-url';
import { cn, formatDate, formatFormalTitle } from '@/lib/format';
import { formatacaoClassNames, sanitizeUnitHtml } from '@/lib/rich-text';
import { unitIndentClass, UNIT_TYPE_LABELS } from '@/lib/unit-hierarchy';
import type { ActAttachment, ActDetail, NormativeUnit, UnitType } from '@/lib/types';

function noteClass(nota: string | null): string {
  if (!nota) return 'text-ink-3';
  if (nota.toLowerCase().includes('revogado')) return 'text-danger';
  if (nota.toLowerCase().includes('incluído')) return 'text-ok';
  return 'text-warn';
}

function SupplementLink({ item }: { item: ActAttachment }) {
  const API_URL = getApiBaseUrl();
  const label = item.titulo || item.nome;
  let href: string | null = null;
  let external = false;
  if (item.href) {
    href = item.href;
    external = /^https?:\/\//i.test(item.href);
  } else if (item.downloadUrl) {
    href = item.downloadUrl.startsWith('http')
      ? item.downloadUrl
      : `${API_URL}${item.downloadUrl}`;
  }
  if (!href) return null;
  return (
    <a
      href={href}
      className="text-[14.5px] text-[#0066cc] underline hover:opacity-90"
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {label}
    </a>
  );
}

const STRUCTURAL_TYPES: UnitType[] = [
  'parte',
  'livro',
  'titulo',
  'subtitulo',
  'capitulo',
  'subcapitulo',
  'secao',
  'subsecao',
  'anexo',
];

function RichHtml({ html, className }: { html: string; className?: string }) {
  const safe = sanitizeUnitHtml(html);
  return (
    <span
      className={cn('[&_a]:text-[#0066cc] [&_a]:underline hover:[&_a]:opacity-90', className)}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}

function sortUnitsForDisplay(units: NormativeUnit[]): NormativeUnit[] {
  /** Ordem padrão: Ementa → Preâmbulo → demais (ordem estruturada). */
  const weight = (tipo: UnitType) => {
    if (tipo === 'ementa') return 0;
    if (tipo === 'preambulo' || tipo === 'considerando') return 1;
    return 2;
  };
  return [...units].sort((a, b) => {
    const wa = weight(a.tipoUnidade);
    const wb = weight(b.tipoUnidade);
    if (wa !== wb) return wa - wb;
    return a.ordem - b.ordem;
  });
}

function MultiParagraph({ html, className }: { html: string; className?: string }) {
  const parts = html
    .split(/\n{2,}|\r\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    return <RichHtml html={html} className={className} />;
  }
  return (
    <>
      {parts.map((part, i) => (
        <p key={i} className={cn(i > 0 && 'mt-3', className)}>
          <RichHtml html={part.replace(/\n/g, '<br/>')} />
        </p>
      ))}
    </>
  );
}

function UnitBlock({
  unit,
  mode,
}: {
  unit: NormativeUnit;
  mode: 'consolidado' | 'original';
}) {
  const isStructural = STRUCTURAL_TYPES.includes(unit.tipoUnidade);
  const isPreamble = unit.tipoUnidade === 'preambulo' || unit.tipoUnidade === 'considerando';
  const isEmenta = unit.tipoUnidade === 'ementa';
  const isSimple = unit.tipoUnidade === 'texto_simples';
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

  const indent = unitIndentClass(unit.tipoUnidade);
  const anchorId =
    unit.identificacao?.replace(/\s+/g, '-').toLowerCase() ?? `unit-${unit.ordem}`;

  if (isEmenta) {
    return (
      <article id={anchorId} className="mb-5 ml-auto max-w-[min(100%,36rem)] text-right">
        <p className="text-[14.5px] leading-relaxed text-ink">
          <RichHtml html={texto} />
        </p>
        {mode === 'consolidado' && unit.nota && (
          <p className={cn('mt-1 text-[12px]', noteClass(unit.nota))}>{unit.nota}</p>
        )}
      </article>
    );
  }

  if (isSimple) {
    return (
      <article id={anchorId} className={cn('mb-4', indent)}>
        <p
          className={cn(
            'text-[15px] leading-[1.75] text-ink',
            formatacaoClassNames(unit.formatacao),
          )}
        >
          <RichHtml html={texto} />
        </p>
      </article>
    );
  }

  if (isPreamble) {
    return (
      <article id={anchorId} className="mb-6 text-[15px] leading-[1.75] text-ink text-justify">
        <MultiParagraph html={texto} />
        {mode === 'consolidado' && unit.nota && (
          <p className={cn('mt-1 text-[12px]', noteClass(unit.nota))}>{unit.nota}</p>
        )}
      </article>
    );
  }

  if (isStructural) {
    return (
      <article id={anchorId} className={cn('mb-5', indent)}>
        <h3 className="text-center text-[15px] font-semibold uppercase tracking-wide text-ink">
          {unit.identificacao && <span className="block">{unit.identificacao}</span>}
          <RichHtml html={texto} />
        </h3>
        {mode === 'consolidado' && unit.nota && (
          <p className={cn('mt-1 text-center text-[12px]', noteClass(unit.nota))}>{unit.nota}</p>
        )}
      </article>
    );
  }

  const showLabel = [
    'artigo',
    'paragrafo_unico',
    'paragrafo',
    'inciso',
    'alinea',
    'item',
  ].includes(unit.tipoUnidade);
  const label = unit.identificacao ?? UNIT_TYPE_LABELS[unit.tipoUnidade];

  return (
    <article
      id={anchorId}
      className={cn('mb-4', indent, isRevoked && mode === 'consolidado' && 'opacity-80')}
    >
      <p className="text-justify text-[15px] leading-[1.75] text-ink">
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
          <RichHtml html={texto} />
        </span>
      </p>
      {mode === 'consolidado' && unit.nota && (
        <p className={cn('mt-1 text-[12px]', noteClass(unit.nota))}>{unit.nota}</p>
      )}
    </article>
  );
}

export function ActContent({ act }: { act: ActDetail }) {
  const [tab, setTab] = useState<'consolidado' | 'original' | 'historico'>('consolidado');
  const [tocOpen, setTocOpen] = useState(false);

  const displayUnits = useMemo(() => sortUnitsForDisplay(act.units), [act.units]);
  const ementaUnit = displayUnits.find((u) => u.tipoUnidade === 'ementa');
  const bodyUnits = displayUnits.filter((u) => u.tipoUnidade !== 'ementa');
  const articles = bodyUnits.filter((u) => u.tipoUnidade === 'artigo' && u.identificacao);
  const tituloFormal =
    act.tituloFormal ?? formatFormalTitle(act.tipo, act.numero, act.ano, act.dataAto);

  return (
    <div className="bg-white text-ink">
      <header className="mb-8">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <FrancaMark size={56} priority />
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-3">
            Prefeitura Municipal de Franca/SP
          </p>
        </div>

        <h1 className="mb-4 text-center text-[17px] font-bold uppercase leading-snug tracking-wide text-ink sm:text-[18px]">
          {tituloFormal}
        </h1>

        {tab !== 'historico' && ementaUnit ? (
          <UnitBlock unit={ementaUnit} mode={tab} />
        ) : tab !== 'historico' && act.ementa ? (
          <p className="ml-auto mb-5 max-w-[min(100%,36rem)] text-right text-[14.5px] leading-relaxed text-ink">
            {act.ementa}
          </p>
        ) : null}

        <p className="no-print text-center text-[12px] text-ink-3">
          {act.codigo}
          <span className="mx-1.5">·</span>
          {act.situacao.replace(/_/g, ' ')}
          {act.orgaoOrigem ? (
            <>
              <span className="mx-1.5">·</span>
              {act.orgaoOrigem}
            </>
          ) : null}
          <span className="mx-1.5">·</span>
          Ato: {formatDate(act.dataAto)}
          <span className="mx-1.5">·</span>
          Pub.: {formatDate(act.dataPublicacao)}
        </p>

        {(act.anexosTopo?.length ?? 0) > 0 && (
          <ul className="mt-5 space-y-1.5 border-t border-line/50 pt-4">
            {act.anexosTopo!.map((item) => (
              <li key={item.id}>
                <SupplementLink item={item} />
              </li>
            ))}
          </ul>
        )}
      </header>

      {tab !== 'historico' && articles.length > 0 && (
        <div className="no-print mb-6 border-b border-line/60 pb-2">
          <button
            type="button"
            onClick={() => setTocOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[14px] text-brand hover:underline"
            aria-expanded={tocOpen}
          >
            Sumário
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', tocOpen && 'rotate-180')}
              aria-hidden
            />
          </button>
          {tocOpen && (
            <ul className="mt-3 space-y-1 pl-1">
              {articles.map((u) => (
                <li key={u.id}>
                  <a
                    href={`#${u.identificacao?.replace(/\s+/g, '-').toLowerCase()}`}
                    className="text-[14px] text-brand hover:underline"
                  >
                    {u.identificacao}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="min-w-0">
        {tab === 'historico' ? (
          <ol className="relative space-y-5 border-l border-line pl-5">
            <li>
              <p className="text-[12px] text-ink-3">{formatDate(act.dataPublicacao)}</p>
              <p className="mt-0.5 font-medium text-ink">Publicação original</p>
              <p className="text-[14px] text-ink-2">{act.codigo}</p>
            </li>
            {act.history.map((h) => (
              <li key={h.id}>
                <p className="text-[12px] text-ink-3">{formatDate(h.data)}</p>
                <p className="mt-0.5 font-medium text-ink">{h.nota ?? h.tipoAlteracao}</p>
                {h.dispositivo && (
                  <p className="text-[13px] text-ink-2">Dispositivo: {h.dispositivo}</p>
                )}
                {h.normaAlteradora && (
                  <p className="text-[13px] text-brand">{h.normaAlteradora.codigo}</p>
                )}
              </li>
            ))}
          </ol>
        ) : (
          bodyUnits.map((unit) => <UnitBlock key={unit.id} unit={unit} mode={tab} />)
        )}
      </div>

      <section className="mt-10 space-y-2 border-t border-line pt-6">
        {(act.anexosFinal?.length ?? 0) > 0 && (
          <ul className="space-y-1.5">
            {act.anexosFinal!.map((item) => (
              <li key={item.id}>
                <SupplementLink item={item} />
              </li>
            ))}
          </ul>
        )}
        {act.arquivoOriginal?.downloadUrl && (
          <p>
            <SupplementLink
              item={{
                ...act.arquivoOriginal,
                titulo: 'Acessar arquivo original do ato',
              }}
            />
          </p>
        )}
      </section>

      <section className="no-print mt-8 border-t border-line pt-6">
        <p className="mb-3 text-[12px] font-medium uppercase tracking-wide text-ink-3">
          Versões e histórico
        </p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'consolidado', label: 'Texto consolidado' },
              { id: 'original', label: 'Texto original' },
              { id: 'historico', label: 'Histórico de alterações' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTab(opt.id)}
              className={cn(
                'rounded border px-3 py-1.5 text-[13px] transition-colors',
                tab === opt.id
                  ? 'border-brand bg-brand-soft text-brand'
                  : 'border-line text-ink-2 hover:border-brand/40',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
