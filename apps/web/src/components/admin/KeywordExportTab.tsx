'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Archive, Download, Search } from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import {
  downloadKeywordExportZip,
  listKeywordExportActs,
  listKeywordExportKeywords,
  type KeywordExportAct,
  type KeywordExportKeyword,
} from '@/lib/admin-api';
import {
  ETAPA_EDITORIAL_LABELS,
  SITUACAO_LABELS,
  cn,
  formatDate,
  type EditorialStage,
} from '@/lib/format';
import type { ActSituacao } from '@/lib/types';

const PUBLICATION_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  em_revisao: 'Em revisão',
  publicado: 'Publicado',
};

export function KeywordExportTab() {
  const { toast } = useToast();
  const [keywords, setKeywords] = useState<KeywordExportKeyword[]>([]);
  const [loadingKeywords, setLoadingKeywords] = useState(true);
  const [query, setQuery] = useState('');
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null);
  const [acts, setActs] = useState<KeywordExportAct[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await listKeywordExportKeywords();
        if (!cancelled) setKeywords(list);
      } catch (err) {
        if (!cancelled) {
          toast(err instanceof Error ? err.message : 'Erro ao carregar palavras-chave', 'danger');
        }
      } finally {
        if (!cancelled) setLoadingKeywords(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const runSearch = useCallback(
    async (keyword: string) => {
      const term = keyword.trim();
      if (!term) {
        toast('Informe uma palavra-chave', 'warn');
        return;
      }
      setSearching(true);
      setActiveKeyword(term);
      try {
        const items = await listKeywordExportActs(term);
        setActs(items);
        setSelected(new Set(items.map((a) => a.id)));
        if (items.length === 0) {
          toast(`Nenhum ato com a palavra-chave “${term}”.`, 'warn');
        }
      } catch (err) {
        setActs([]);
        setSelected(new Set());
        toast(err instanceof Error ? err.message : 'Erro na busca', 'danger');
      } finally {
        setSearching(false);
      }
    },
    [toast],
  );

  const allSelected = acts !== null && acts.length > 0 && selected.size === acts.length;
  const selectedCount = selected.size;

  const toggleAll = () => {
    if (!acts) return;
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(acts.map((a) => a.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onExport = async () => {
    if (!activeKeyword) return;
    if (selectedCount === 0) {
      toast('Selecione ao menos um ato para exportar', 'warn');
      return;
    }
    setExporting(true);
    try {
      await downloadKeywordExportZip(activeKeyword, Array.from(selected));
      toast(`${selectedCount} PDF(s) empacotados no ZIP.`, 'ok');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao gerar o ZIP', 'danger');
    } finally {
      setExporting(false);
    }
  };

  const chipKeywords = useMemo(() => keywords.slice(0, 24), [keywords]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="rounded-[14px] border border-line bg-surface p-5">
        <div className="flex items-start gap-3">
          <Archive className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold text-ink">Exportar por palavra-chave</h3>
            <p className="mt-1 text-[13.5px] text-ink-3">
              Localiza todos os atos que possuem a palavra-chave informada, mostra a lista e
              permite baixar os selecionados em um arquivo ZIP — cada ato como PDF consolidado.
            </p>
          </div>
        </div>

        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(query);
          }}
        >
          <label className="min-w-0 flex-1 text-[12px] font-medium text-ink-2">
            Palavra-chave
            <Input
              className="mt-1.5"
              list="siglm-keyword-export-list"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex.: ISS, tributação, IPTU"
              autoComplete="off"
              disabled={searching || exporting}
            />
            <datalist id="siglm-keyword-export-list">
              {keywords.map((k) => (
                <option key={k.palavra} value={k.palavra} />
              ))}
            </datalist>
          </label>
          <Button type="submit" disabled={searching || exporting || !query.trim()}>
            <Search className="h-4 w-4" aria-hidden="true" />
            {searching ? 'Buscando…' : 'Buscar atos'}
          </Button>
        </form>

        {loadingKeywords ? (
          <p className="mt-3 text-[13px] text-ink-3">Carregando palavras-chave cadastradas…</p>
        ) : keywords.length > 0 ? (
          <div className="mt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-4">
              Palavras-chave no acervo
            </p>
            <div className="flex flex-wrap gap-1.5">
              {chipKeywords.map((k) => (
                <button
                  key={k.palavra}
                  type="button"
                  disabled={searching || exporting}
                  onClick={() => {
                    setQuery(k.palavra);
                    void runSearch(k.palavra);
                  }}
                  className={cn(
                    'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                    activeKeyword?.toLowerCase() === k.palavra.toLowerCase()
                      ? 'border-brand bg-brand-soft text-brand'
                      : 'border-line bg-surface text-ink-2 hover:border-brand/40 hover:text-brand',
                  )}
                >
                  {k.palavra}
                  <span className="font-mono text-[11px] text-ink-3">{k.total}</span>
                </button>
              ))}
              {keywords.length > chipKeywords.length && (
                <span className="self-center text-[12px] text-ink-4">
                  +{keywords.length - chipKeywords.length} no campo acima
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-ink-3">
            Nenhum ato possui palavra-chave cadastrada ainda.
          </p>
        )}
      </section>

      {acts !== null && (
        <section className="rounded-[14px] border border-line bg-surface">
          <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-[15px] font-semibold text-ink">
                {acts.length === 0
                  ? 'Nenhum resultado'
                  : `${acts.length} ${acts.length === 1 ? 'ato encontrado' : 'atos encontrados'}`}
              </h3>
              {activeKeyword && (
                <p className="mt-0.5 text-[13px] text-ink-3">
                  Palavra-chave: <span className="font-semibold text-ink">{activeKeyword}</span>
                  {acts.length > 0 && (
                    <>
                      {' '}
                      · {selectedCount} selecionado{selectedCount === 1 ? '' : 's'}
                    </>
                  )}
                </p>
              )}
            </div>
            <Button
              onClick={() => void onExport()}
              disabled={exporting || searching || selectedCount === 0}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {exporting
                ? 'Gerando ZIP…'
                : `Exportar ZIP (${selectedCount} PDF${selectedCount === 1 ? '' : 's'})`}
            </Button>
          </div>

          {acts.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13.5px] text-ink-3">
              Não há registros com essa palavra-chave. Tente outra do acervo ou cadastre a
              palavra-chave no editor do ato.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left">
                <thead className="bg-surface-2 text-[11px] font-semibold uppercase tracking-wide text-ink-4">
                  <tr>
                    <th className="w-10 px-4 py-2.5">
                      <input
                        type="checkbox"
                        aria-label="Selecionar todos"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="h-4 w-4 rounded border-line"
                      />
                    </th>
                    <th className="px-4 py-2.5">Norma</th>
                    <th className="px-4 py-2.5">Ementa</th>
                    <th className="px-4 py-2.5">Situação</th>
                    <th className="px-4 py-2.5">Órgão</th>
                    <th className="px-4 py-2.5">Palavras-chave</th>
                  </tr>
                </thead>
                <tbody>
                  {acts.map((act) => (
                    <tr key={act.id} className="border-t border-line-2 hover:bg-surface-2">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${act.codigo}`}
                          checked={selected.has(act.id)}
                          onChange={() => toggleOne(act.id)}
                          className="h-4 w-4 rounded border-line"
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link
                          href={`/admin/atos/${act.id}/editor`}
                          className="font-mono text-[13px] font-semibold text-brand hover:underline"
                        >
                          {act.codigo}
                        </Link>
                        <div className="mt-0.5 text-[11.5px] text-ink-3">
                          {PUBLICATION_LABELS[act.statusPublicacao] ?? act.statusPublicacao}
                          {' · '}
                          {ETAPA_EDITORIAL_LABELS[act.etapaEditorial as EditorialStage] ??
                            act.etapaEditorial}
                        </div>
                      </td>
                      <td className="max-w-sm px-4 py-3 text-[13px] text-ink-2">
                        <p className="line-clamp-2">{act.ementa}</p>
                        {act.dataPublicacao && (
                          <p className="mt-1 text-[11.5px] font-mono text-ink-4">
                            {formatDate(act.dataPublicacao)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          situacao={act.situacao as ActSituacao}
                          label={SITUACAO_LABELS[act.situacao as ActSituacao] ?? act.situacao}
                        />
                      </td>
                      <td className="px-4 py-3 text-[12.5px] text-ink-3">
                        {act.orgaoOrigem ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {act.palavrasChave.map((p) => (
                            <Badge
                              key={p}
                              variant={
                                p.toLowerCase() === activeKeyword?.toLowerCase() ? 'info' : 'neutral'
                              }
                            >
                              {p}
                            </Badge>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
