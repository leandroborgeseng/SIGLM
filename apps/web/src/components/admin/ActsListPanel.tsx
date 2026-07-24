'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, GitMerge, Pencil, Upload, X } from 'lucide-react';
import { AdminTopbar, KpiCard } from '@/components/admin/AdminShell';
import { NewActButton } from '@/components/admin/NewActButton';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { adminListActs } from '@/lib/admin-api';
import {
  actUrl,
  ETAPA_EDITORIAL_LABELS,
  ETAPAS_EDITORIAIS,
  formatDate,
  SITUACAO_LABELS,
  SITUACOES,
  type EditorialStage,
} from '@/lib/format';
import type { AdminListResponse } from '@/lib/types';

const STATUS_OPTS = [
  { value: '', label: 'Todos' },
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'em_revisao', label: 'Em revisão' },
  { value: 'publicado', label: 'Publicado' },
];

type Filters = {
  norma: string;
  ementa: string;
  situacao: string;
  statusPublicacao: string;
  etapaEditorial: string;
  publicadoDe: string;
  publicadoAte: string;
};

const EMPTY: Filters = {
  norma: '',
  ementa: '',
  situacao: '',
  statusPublicacao: '',
  etapaEditorial: '',
  publicadoDe: '',
  publicadoAte: '',
};

export function ActsListPanel({ initial }: { initial: AdminListResponse }) {
  const { toast } = useToast();
  const [data, setData] = useState(initial);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (f: Filters, p: number) => {
      setLoading(true);
      try {
        const next = await adminListActs({
          norma: f.norma.trim() || undefined,
          ementa: f.ementa.trim() || undefined,
          situacao: f.situacao || undefined,
          statusPublicacao: f.statusPublicacao || undefined,
          etapaEditorial: f.etapaEditorial || undefined,
          publicadoDe: f.publicadoDe || undefined,
          publicadoAte: f.publicadoAte || undefined,
          page: p,
          limit: 20,
        });
        setData(next);
        setPage(p);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Erro ao filtrar atos', 'danger');
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  // Debounce texto; selects/datas aplicam sob demanda via botão ou Enter.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (
        draft.norma !== filters.norma ||
        draft.ementa !== filters.ementa
      ) {
        const next = { ...filters, norma: draft.norma, ementa: draft.ementa };
        setFilters(next);
        void load(next, 1);
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [draft.norma, draft.ementa, filters, load]);

  const applySelectFilters = (patch: Partial<Filters>) => {
    const next = { ...filters, ...draft, ...patch };
    setDraft(next);
    setFilters(next);
    void load(next, 1);
  };

  const clearFilters = () => {
    setDraft(EMPTY);
    setFilters(EMPTY);
    void load(EMPTY, 1);
  };

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <>
      <AdminTopbar
        title="Atos normativos"
        sticky
        actions={
          <div className="flex gap-2">
            <Link href="/admin/importar">
              <Button variant="outlined" size="sm">
                <Upload className="h-4 w-4" />
                Importar arquivo
              </Button>
            </Link>
            <NewActButton />
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Total de atos" value={data.kpis.total} />
          <KpiCard label="Vigentes" value={data.kpis.vigentes} />
          <KpiCard label="Aguardando revisão" value={data.kpis.emRevisao} />
          <KpiCard label="Publicados no mês" value={data.kpis.publicadosMes} />
        </div>

        <div className="overflow-x-auto rounded-[14px] border border-line bg-surface shadow-sm">
          <table className="w-full min-w-[1120px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line-2 bg-surface-2">
                <th className="text-section whitespace-nowrap px-4 py-3">Norma</th>
                <th className="text-section min-w-[200px] px-4 py-3">Ementa</th>
                <th className="text-section whitespace-nowrap px-4 py-3">Situação</th>
                <th className="text-section whitespace-nowrap px-4 py-3">Status</th>
                <th className="text-section whitespace-nowrap px-4 py-3">Estágio editorial</th>
                <th className="text-section whitespace-nowrap px-4 py-3">Publicação</th>
                <th className="text-section whitespace-nowrap px-4 py-3">Ações</th>
              </tr>
              <tr className="border-b border-line bg-surface">
                <th className="px-3 py-2 align-top">
                  <Input
                    value={draft.norma}
                    onChange={(e) => setDraft((d) => ({ ...d, norma: e.target.value }))}
                    placeholder="Filtrar norma…"
                    className="h-9 text-[12.5px]"
                    aria-label="Filtrar por norma"
                  />
                </th>
                <th className="px-3 py-2 align-top">
                  <Input
                    value={draft.ementa}
                    onChange={(e) => setDraft((d) => ({ ...d, ementa: e.target.value }))}
                    placeholder="Filtrar ementa…"
                    className="h-9 text-[12.5px]"
                    aria-label="Filtrar por ementa"
                  />
                </th>
                <th className="px-3 py-2 align-top">
                  <Select
                    value={draft.situacao}
                    onChange={(e) => applySelectFilters({ situacao: e.target.value })}
                    className="h-9 text-[12.5px]"
                    aria-label="Filtrar por situação"
                  >
                    <option value="">Todas</option>
                    {SITUACOES.map((s) => (
                      <option key={s} value={s}>
                        {SITUACAO_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </th>
                <th className="px-3 py-2 align-top">
                  <Select
                    value={draft.statusPublicacao}
                    onChange={(e) => applySelectFilters({ statusPublicacao: e.target.value })}
                    className="h-9 text-[12.5px]"
                    aria-label="Filtrar por status"
                  >
                    {STATUS_OPTS.map((o) => (
                      <option key={o.value || 'all'} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </th>
                <th className="px-3 py-2 align-top">
                  <Select
                    value={draft.etapaEditorial}
                    onChange={(e) => applySelectFilters({ etapaEditorial: e.target.value })}
                    className="h-9 text-[12.5px]"
                    aria-label="Filtrar por estágio editorial"
                  >
                    <option value="">Todos</option>
                    {ETAPAS_EDITORIAIS.map((e) => (
                      <option key={e} value={e}>
                        {ETAPA_EDITORIAL_LABELS[e]}
                      </option>
                    ))}
                  </Select>
                </th>
                <th className="px-3 py-2 align-top">
                  <div className="flex min-w-[168px] flex-col gap-1">
                    <Input
                      type="date"
                      value={draft.publicadoDe}
                      onChange={(e) => applySelectFilters({ publicadoDe: e.target.value })}
                      className="h-9 font-mono text-[11.5px]"
                      aria-label="Data inicial de publicação"
                    />
                    <Input
                      type="date"
                      value={draft.publicadoAte}
                      onChange={(e) => applySelectFilters({ publicadoAte: e.target.value })}
                      className="h-9 font-mono text-[11.5px]"
                      aria-label="Data final de publicação"
                    />
                  </div>
                </th>
                <th className="px-3 py-2 align-top">
                  {hasFilters && (
                    <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
                      <X className="h-3.5 w-3.5" />
                      Limpar
                    </Button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ink-3">
                    Filtrando…
                  </td>
                </tr>
              ) : data.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ink-3">
                    Nenhum ato encontrado com os filtros informados.
                  </td>
                </tr>
              ) : (
                data.items.map((act) => (
                  <tr key={act.id} className="border-b border-line-2 transition hover:bg-surface-2">
                    <td className="px-4 py-3 text-[13px] font-semibold text-brand">
                      {act.codigo}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-ink-2">{act.ementa}</td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        situacao={act.situacao}
                        label={SITUACAO_LABELS[act.situacao]}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-muted-bg px-2 py-0.5 text-[11px] font-semibold uppercase text-muted">
                        {act.statusPublicacao.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[12px] text-ink-2">
                        {act.etapaEditorial
                          ? ETAPA_EDITORIAL_LABELS[act.etapaEditorial as EditorialStage] ??
                            act.etapaEditorial
                          : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[12.5px] text-ink-3">
                      {formatDate(act.dataPublicacao)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Link href={`/admin/atos/${act.id}/editor`}>
                          <Button variant="ghost" size="xs">
                            <Pencil className="h-3.5 w-3.5" />
                            Editar
                          </Button>
                        </Link>
                        <Link href={`/admin/consolidar?act=${act.id}`}>
                          <Button variant="ghost" size="xs">
                            <GitMerge className="h-3.5 w-3.5" />
                            Consolidar
                          </Button>
                        </Link>
                        <Link href={actUrl(act.slug)} target="_blank">
                          <Button variant="ghost" size="xs">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Ver público
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data.totalPages > 1 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-3">
            <span>
              Página {data.page} de {data.totalPages} ({data.total} ato
              {data.total === 1 ? '' : 's'})
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outlined"
                disabled={page <= 1 || loading}
                onClick={() => void load(filters, page - 1)}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outlined"
                disabled={page >= data.totalPages || loading}
                onClick={() => void load(filters, page + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
