'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { FrancaBrasao } from '@/components/brand/FrancaBrasao';
import { getApiBaseUrl } from '@/lib/api-url';
import { cn, formatDate, formatFormalTitle, actUrl } from '@/lib/format';
import { formatacaoClassNames, sanitizeUnitHtml } from '@/lib/rich-text';
import {
  unitAnchorId,
  unitIndentClass,
  unitTocDepth,
  unitTocLabel,
  UNIT_TYPE_LABELS,
} from '@/lib/unit-hierarchy';
import type { ActAttachment, ActDetail, NormativeUnit, UnitType } from '@/lib/types';

function UnitNote({
  nota,
  notaLink,
}: {
  nota: string;
  notaLink?: { href: string; externo?: boolean } | null;
}) {
  const className = cn('mt-1 text-[12px]', noteClass(nota));
  if (!notaLink?.href) {
    return <p className={className}>{nota}</p>;
  }
  if (notaLink.externo) {
    return (
      <p className={className}>
        <a
          href={notaLink.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#0066cc] underline hover:opacity-90"
        >
          {nota}
        </a>
      </p>
    );
  }
  return (
    <p className={className}>
      <Link href={notaLink.href} className="text-[#0066cc] underline hover:opacity-90">
        {nota}
      </Link>
    </p>
  );
}

function OutboundEffects({
  effects,
}: {
  effects: { label: string; href: string }[];
}) {
  if (effects.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {effects.map((e) => (
        <li key={`${e.href}-${e.label}`}>
          <Link
            href={e.href}
            className="text-[11px] text-brand hover:underline"
          >
            {e.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

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
  if (item.href) {
    href = item.href;
  } else if (item.downloadUrl) {
    href = item.downloadUrl.startsWith('http')
      ? item.downloadUrl
      : `${API_URL}${item.downloadUrl}`;
  }
  if (!href) {
    return (
      <span
        className="text-[14.5px] text-ink-3"
        title="O arquivo não pôde ser localizado"
      >
        {label} (indisponível)
      </span>
    );
  }
  // Hiperlinks e arquivos abrem em nova aba; a API decide inline (PDF/imagem) vs download.
  return (
    <a
      href={href}
      className="text-[14.5px] text-[#0066cc] underline hover:opacity-90"
      target="_blank"
      rel="noopener noreferrer"
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
      className={cn(
        '[&_a]:text-[#0066cc] [&_a]:underline hover:[&_a]:opacity-90',
        className,
      )}
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
  const anchorId = unitAnchorId(unit);

  if (isEmenta) {
    return (
      <article
        id={anchorId}
        className="mb-5 ml-auto w-full max-w-[min(100%,36rem)] text-left sm:w-[min(100%,50%)]"
      >
        <p className="text-justify text-[14.5px] leading-relaxed text-ink">
          <RichHtml html={texto} />
        </p>
        {mode === 'consolidado' && unit.nota && (
          <UnitNote nota={unit.nota} notaLink={unit.notaLink} />
        )}
        {mode === 'consolidado' && (unit.alteracoesSaida?.length ?? 0) > 0 && (
          <OutboundEffects effects={unit.alteracoesSaida!} />
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
        <p>
          <RichHtml html={texto} />
        </p>
        {mode === 'consolidado' && unit.nota && (
          <UnitNote nota={unit.nota} notaLink={unit.notaLink} />
        )}
        {mode === 'consolidado' && (unit.alteracoesSaida?.length ?? 0) > 0 && (
          <OutboundEffects effects={unit.alteracoesSaida!} />
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
          <UnitNote nota={unit.nota} notaLink={unit.notaLink} />
        )}
        {mode === 'consolidado' && (unit.alteracoesSaida?.length ?? 0) > 0 && (
          <OutboundEffects effects={unit.alteracoesSaida!} />
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
        <UnitNote nota={unit.nota} notaLink={unit.notaLink} />
      )}
      {mode === 'consolidado' && (unit.alteracoesSaida?.length ?? 0) > 0 && (
        <OutboundEffects effects={unit.alteracoesSaida!} />
      )}
    </article>
  );
}

/** Frase institucional (ticket 37) — gerada, não faz parte do Texto Estruturado. */
function PublicationDisclaimer({ act }: { act: ActDetail }) {
  const meio = act.meioPublicacao?.nome?.trim() || '';
  const data = act.dataPublicacao ? formatDate(act.dataPublicacao) : '';
  const file = act.arquivoPublicacao;
  const API_URL = getApiBaseUrl();
  let fileHref: string | null = null;
  if (file?.downloadUrl) {
    fileHref = file.downloadUrl.startsWith('http')
      ? file.downloadUrl
      : `${API_URL}${file.downloadUrl}`;
  } else if (file?.href) {
    fileHref = file.href;
  }

  const meioNode =
    meio && fileHref ? (
      <a
        href={fileHref}
        className="text-[#0066cc] underline hover:opacity-90"
        target="_blank"
        rel="noopener noreferrer"
      >
        {meio}
      </a>
    ) : meio ? (
      meio
    ) : null;

  let content: React.ReactNode;
  if (meio && data && data !== '—') {
    content = (
      <>
        Este texto não substitui o publicado no {meioNode} em {data}.
      </>
    );
  } else if (meio) {
    content = <>Este texto não substitui o publicado no {meioNode}.</>;
  } else if (data && data !== '—') {
    content = <>Este texto não substitui o publicado em {data}.</>;
  } else {
    content = <>Este texto não substitui o publicado.</>;
  }

  return (
    <p className="mt-8 text-[15px] leading-[1.75] text-[#c62828] print:text-[#c62828]">
      {content}
    </p>
  );
}

function SignatoriesBlock({ act }: { act: ActDetail }) {
  const list = act.signatarios ?? [];
  if (list.length === 0) return null;
  return (
    <div className="mt-10 space-y-6">
      {list.map((s) => (
        <div key={s.id} className="text-center text-[15px] leading-[1.75] text-ink">
          <p className="font-semibold">{s.nome}</p>
          {s.cargo ? <p className="mt-0.5">{s.cargo}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function ActContent({ act }: { act: ActDetail }) {
  const [tab, setTab] = useState<'consolidado' | 'original' | 'historico'>('consolidado');
  const [tocOpen, setTocOpen] = useState(false);

  const displayUnits = useMemo(() => sortUnitsForDisplay(act.units), [act.units]);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;

    const scrollToAnchor = () => {
      const el = document.getElementById(hash);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-brand/40', 'ring-offset-2', 'transition-shadow');
      const timer = window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-brand/40', 'ring-offset-2', 'transition-shadow');
      }, 2400);
      return () => window.clearTimeout(timer);
    };

    const cleanup = scrollToAnchor();
    return cleanup;
  }, [displayUnits]);
  const ementaUnit = displayUnits.find((u) => u.tipoUnidade === 'ementa');
  const bodyUnits = displayUnits.filter((u) => u.tipoUnidade !== 'ementa');
  const tocUnits = useMemo(
    () => displayUnits.filter((u) => unitTocLabel(u).trim().length > 0),
    [displayUnits],
  );
  const tituloFormal =
    act.tituloFormal ?? formatFormalTitle(act.tipo, act.numero, act.ano, act.dataAto);

  const orgaos =
    act.orgaosOrigem && act.orgaosOrigem.length > 0
      ? act.orgaosOrigem.map((o) => o.nome)
      : act.orgaoOrigem
        ? [act.orgaoOrigem]
        : [];

  const structuredAvailable =
    act.textoEstruturadoDisponivel !== undefined
      ? act.textoEstruturadoDisponivel
      : displayUnits.length > 0;
  const fileOnlyPublic = !structuredAvailable;

  const originalHref = (() => {
    const file = act.arquivoOriginal;
    if (!file?.downloadUrl && !file?.href) return null;
    const API_URL = getApiBaseUrl();
    if (file.href && /^https?:\/\//i.test(file.href)) return file.href;
    if (file.downloadUrl?.startsWith('http')) return file.downloadUrl;
    if (file.downloadUrl) return `${API_URL}${file.downloadUrl}`;
    return file.href ?? null;
  })();

  return (
    <div className="bg-white text-ink">
      {/* Auxiliares de navegação — fora do texto oficial */}
      <div className="no-print mb-6 space-y-3 border-b border-line/60 pb-4">
        <p className="text-center text-[12px] text-ink-3 sm:text-left">
          {act.codigo}
          <span className="mx-1.5">·</span>
          {act.situacao.replace(/_/g, ' ')}
          {orgaos.length > 0 ? (
            <>
              <span className="mx-1.5">·</span>
              {orgaos.join(' / ')}
            </>
          ) : null}
          <span className="mx-1.5">·</span>
          Ato: {formatDate(act.dataAto)}
          <span className="mx-1.5">·</span>
          Pub.: {formatDate(act.dataPublicacao)}
        </p>

        {!fileOnlyPublic && tab !== 'historico' && tocUnits.length > 0 && (
          <div>
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
              <nav
                className="mt-3 max-h-[min(40vh,280px)] overflow-y-auto overscroll-contain rounded-[10px] border border-line/70 bg-surface-2/40 py-2 pr-1 sm:max-h-[min(36vh,320px)]"
                aria-label="Sumário do ato"
              >
                <ul className="space-y-0.5">
                  {tocUnits.map((u) => {
                    const depth = unitTocDepth(u, displayUnits);
                    return (
                      <li key={u.id} style={{ paddingLeft: `${depth * 12}px` }}>
                        <a
                          href={`#${unitAnchorId(u)}`}
                          className="block rounded px-2 py-1 text-[13.5px] text-brand hover:bg-brand/5 hover:underline"
                          onClick={() => setTocOpen(false)}
                        >
                          {unitTocLabel(u)}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            )}
          </div>
        )}
      </div>

      <header className="mb-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center sm:flex-row sm:items-center sm:justify-center sm:gap-4 sm:text-left">
          <FrancaBrasao size={78} priority />
          <div className="min-w-0 leading-snug">
            <p className="text-[14px] font-semibold tracking-wide text-ink sm:text-[15px]">
              Prefeitura Municipal de Franca/SP
            </p>
            {orgaos.map((nome) => (
              <p
                key={nome}
                className="mt-0.5 text-[12.5px] font-medium text-ink-2 sm:text-[13px]"
              >
                {nome}
              </p>
            ))}
          </div>
        </div>

        <h1 className="mb-4 text-center text-[17px] font-bold uppercase leading-snug tracking-wide text-ink sm:text-[18px]">
          {tituloFormal}
        </h1>

        {tab !== 'historico' && ementaUnit ? (
          <UnitBlock unit={ementaUnit} mode={tab} />
        ) : tab !== 'historico' && act.ementa ? (
          <p className="mb-5 ml-auto w-full max-w-[min(100%,36rem)] text-justify text-[14.5px] leading-relaxed text-ink sm:w-[min(100%,50%)]">
            <RichHtml html={act.ementa} />
          </p>
        ) : null}

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

      {fileOnlyPublic ? (
        <section className="min-w-0 rounded-[12px] border border-line/70 bg-surface-2/30 px-5 py-6">
          <p className="text-[14.5px] leading-relaxed text-ink-2">
            O texto estruturado ainda não está disponível para consulta. O conteúdo oficial deste
            ato pode ser acessado pelo arquivo original.
          </p>
          {originalHref ? (
            <p className="mt-4">
              <a
                href={originalHref}
                className="inline-flex text-[15px] font-semibold text-[#0066cc] underline hover:opacity-90"
                target="_blank"
                rel="noopener noreferrer"
              >
                Acessar arquivo original do ato
              </a>
            </p>
          ) : (
            <p className="mt-4 text-[13px] text-ink-3">
              O arquivo original não pôde ser localizado ou não está disponível para acesso.
            </p>
          )}
        </section>
      ) : (
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
                  <p className="mt-0.5 font-medium text-ink">
                    {h.nota ?? h.tipoAlteracao}
                    {h.incomplete ? (
                      <span className="ml-2 text-[11px] text-warn">(vínculo incompleto)</span>
                    ) : null}
                  </p>
                  {h.dispositivo && (
                    <p className="text-[13px] text-ink-2">Dispositivo: {h.dispositivo}</p>
                  )}
                  {h.sourceUnit?.identificacao && (
                    <p className="text-[13px] text-ink-2">
                      Elemento alterador: {h.sourceUnit.identificacao}
                    </p>
                  )}
                  {h.normaAlteradora && (
                    <Link
                      href={actUrl(h.normaAlteradora.slug)}
                      className="text-[13px] text-brand hover:underline"
                    >
                      {h.normaAlteradora.codigo}
                    </Link>
                  )}
                  {h.externalSource && (
                    <p className="text-[13px] text-ink-2">
                      Fonte externa: {h.externalSource.emissor}
                      {h.externalSource.url ? (
                        <>
                          {' '}
                          <a
                            href={h.externalSource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand hover:underline"
                          >
                            (link)
                          </a>
                        </>
                      ) : null}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            bodyUnits.map((unit) => <UnitBlock key={unit.id} unit={unit} mode={tab} />)
          )}
        </div>
      )}

      {!fileOnlyPublic && tab !== 'historico' && (
        <>
          <SignatoriesBlock act={act} />
          <PublicationDisclaimer act={act} />
        </>
      )}

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
        {!fileOnlyPublic && act.arquivoOriginal?.downloadUrl && (
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

      {!fileOnlyPublic && (
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
      )}
    </div>
  );
}
