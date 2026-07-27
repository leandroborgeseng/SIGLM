'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ExternalLink, GitMerge, Pencil, SlidersHorizontal, Upload, X } from 'lucide-react';
import { AdminTopbar, KpiCard } from '@/components/admin/AdminShell';
import { NewActButton } from '@/components/admin/NewActButton';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useToast } from '@/components/ui/Toast';
import {
  adminListActs,
  getAdminFilterOptions,
  type AdminFilterOptions,
  type BatchUpdateActsPayload,
  type BatchUpdateActsResult,
} from '@/lib/admin-api';
import {
  actUrl,
  cn,
  ACT_TYPE_LABELS,
  ACT_TYPES,
  ETAPA_EDITORIAL_LABELS,
  ETAPAS_EDITORIAIS,
  formatDate,
  formatOriginOrgLabel,
  SITUACAO_LABELS,
  SITUACOES,
  type EditorialStage,
} from '@/lib/format';
import type { AdminListResponse } from '@/lib/types';
import { ActBatchBar } from '@/components/admin/ActBatchBar';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';

const STATUS_OPTS = [
  { value: '', label: 'Todos' },
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'em_revisao', label: 'Em revisão' },
  { value: 'publicado', label: 'Publicado' },
];

const ETAPA_BADGE_VARIANT: Record<EditorialStage, 'neutral' | 'info' | 'warn' | 'ok'> = {
  somente_arquivo_original: 'neutral',
  em_estruturacao: 'info',
  aguardando_revisao: 'warn',
  estruturado: 'ok',
};

function filterSelectClass(hasValue: boolean) {
  return cn('h-9 text-[12.5px] font-normal', !hasValue && 'text-ink-4');
}

type Filters = {
  norma: string;
  ementa: string;
  situacao: string;
  statusPublicacao: string;
  etapaEditorial: string;
  publicadoDe: string;
  publicadoAte: string;
  orgaoOrigemId: string;
  tipo: string;
  numeroDe: string;
  numeroAte: string;
  meioPublicacaoId: string;
  signatarioNome: string;
  responsavelEstruturacaoId: string;
  responsavelRevisaoId: string;
};

const EMPTY: Filters = {
  norma: '',
  ementa: '',
  situacao: '',
  statusPublicacao: '',
  etapaEditorial: '',
  publicadoDe: '',
  publicadoAte: '',
  orgaoOrigemId: '',
  tipo: '',
  numeroDe: '',
  numeroAte: '',
  meioPublicacaoId: '',
  signatarioNome: '',
  responsavelEstruturacaoId: '',
  responsavelRevisaoId: '',
};

const ADVANCED_KEYS: (keyof Filters)[] = [
  'orgaoOrigemId',
  'tipo',
  'numeroDe',
  'numeroAte',
  'meioPublicacaoId',
  'signatarioNome',
  'responsavelEstruturacaoId',
  'responsavelRevisaoId',
];

function countAdvancedFilters(f: Filters) {
  return ADVANCED_KEYS.filter((k) => Boolean(f[k]?.trim())).length;
}

function toListParams(f: Filters, p: number) {
  return {
    norma: f.norma.trim() || undefined,
    ementa: f.ementa.trim() || undefined,
    situacao: f.situacao || undefined,
    statusPublicacao: f.statusPublicacao || undefined,
    etapaEditorial: f.etapaEditorial || undefined,
    publicadoDe: f.publicadoDe || undefined,
    publicadoAte: f.publicadoAte || undefined,
    orgaoOrigemId: f.orgaoOrigemId || undefined,
    tipo: f.tipo || undefined,
    numeroDe: f.numeroDe.trim() || undefined,
    numeroAte: f.numeroAte.trim() || undefined,
    meioPublicacaoId: f.meioPublicacaoId || undefined,
    signatarioNome: f.signatarioNome || undefined,
    responsavelEstruturacaoId: f.responsavelEstruturacaoId || undefined,
    responsavelRevisaoId: f.responsavelRevisaoId || undefined,
    page: p,
    limit: 20,
  };
}

function filtersToBatchPayload(f: Filters): BatchUpdateActsPayload {
  return {
    action: 'set_responsavel_estruturacao',
    norma: f.norma.trim() || undefined,
    ementa: f.ementa.trim() || undefined,
    situacao: f.situacao || undefined,
    statusPublicacao: f.statusPublicacao || undefined,
    etapaEditorial: f.etapaEditorial || undefined,
    publicadoDe: f.publicadoDe || undefined,
    publicadoAte: f.publicadoAte || undefined,
    orgaoOrigemId: f.orgaoOrigemId || undefined,
    tipo: f.tipo || undefined,
    numeroDe: f.numeroDe.trim() || undefined,
    numeroAte: f.numeroAte.trim() || undefined,
    meioPublicacaoIdFilter: f.meioPublicacaoId || undefined,
    signatarioNome: f.signatarioNome || undefined,
    responsavelEstruturacaoIdFilter: f.responsavelEstruturacaoId || undefined,
    responsavelRevisaoIdFilter: f.responsavelRevisaoId || undefined,
  };
}

function responsavelLabel(user: { nome: string; ativo: boolean } | null | undefined) {
  if (!user) return '—';
  return user.ativo ? user.nome : `${user.nome} (inativo)`;
}

function AdvancedFiltersForm({
  draft,
  setDraft,
  options,
  onApply,
  idPrefix = '',
}: {
  draft: Filters;
  setDraft: React.Dispatch<React.SetStateAction<Filters>>;
  options: AdminFilterOptions | null;
  onApply: (patch: Partial<Filters>) => void;
  idPrefix?: string;
}) {
  const orgOptions =
    options?.orgaos.map((o) => ({
      value: o.id,
      label: formatOriginOrgLabel(o),
      searchText: `${o.sigla ?? ''} ${o.nome}`.trim(),
    })) ?? [];

  const meioOptions =
    options?.meios.map((m) => ({
      value: m.id,
      label: m.nome,
    })) ?? [];

  const signatarioOptions =
    options?.signatarios.map((nome) => ({
      value: nome,
      label: nome,
    })) ?? [];

  const userOptions =
    options?.users.map((u) => ({
      value: u.id,
      label: u.nome,
      searchText: `${u.nome} ${u.email}`,
    })) ?? [];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <label className="block text-[11px] text-ink-3">
        Órgão de origem
        <SearchableSelect
          className="mt-1"
          aria-label="Órgão de origem"
          value={draft.orgaoOrigemId}
          onChange={(v) => onApply({ orgaoOrigemId: v ?? '' })}
          options={orgOptions}
          allLabel="Todos os órgãos"
          searchPlaceholder="Buscar por sigla ou nome…"
        />
      </label>
      <label className="block text-[11px] text-ink-3">
        Tipo do ato
        <Select
          value={draft.tipo}
          onChange={(e) => onApply({ tipo: e.target.value })}
          className={cn('mt-1', filterSelectClass(Boolean(draft.tipo)))}
          aria-label="Tipo do ato"
        >
          <option value="">Todos</option>
          {ACT_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACT_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </label>
      <label className="block text-[11px] text-ink-3">
        Meio de publicação
        <SearchableSelect
          className="mt-1"
          aria-label="Meio de publicação"
          value={draft.meioPublicacaoId}
          onChange={(v) => onApply({ meioPublicacaoId: v ?? '' })}
          options={meioOptions}
          allLabel="Todos"
          searchPlaceholder="Buscar meio…"
        />
      </label>
      <label className="block text-[11px] text-ink-3">
        Signatário
        <SearchableSelect
          className="mt-1"
          aria-label="Signatário"
          value={draft.signatarioNome}
          onChange={(v) => onApply({ signatarioNome: v ?? '' })}
          options={signatarioOptions}
          allLabel="Todos"
          searchPlaceholder="Buscar signatário…"
        />
      </label>
      <label className="block text-[11px] text-ink-3">
        Resp. estruturação
        <SearchableSelect
          className="mt-1"
          aria-label="Responsável pela estruturação"
          value={draft.responsavelEstruturacaoId}
          onChange={(v) => onApply({ responsavelEstruturacaoId: v ?? '' })}
          options={userOptions}
          allLabel="Todos"
          searchPlaceholder="Buscar usuário…"
        />
      </label>
      <label className="block text-[11px] text-ink-3">
        Resp. revisão/publicação
        <SearchableSelect
          className="mt-1"
          aria-label="Responsável pela revisão e publicação"
          value={draft.responsavelRevisaoId}
          onChange={(v) => onApply({ responsavelRevisaoId: v ?? '' })}
          options={userOptions}
          allLabel="Todos"
          searchPlaceholder="Buscar usuário…"
        />
      </label>
      <label className="block text-[11px] text-ink-3">
        Número inicial
        <Input
          id={`${idPrefix}numero-de`}
          value={draft.numeroDe}
          onChange={(e) => setDraft((d) => ({ ...d, numeroDe: e.target.value }))}
          onBlur={(e) => onApply({ numeroDe: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onApply({ numeroDe: (e.target as HTMLInputElement).value });
          }}
          placeholder="Ex.: 12.268"
          className="mt-1 h-9 font-mono text-[12.5px]"
          aria-label="Número inicial"
        />
      </label>
      <label className="block text-[11px] text-ink-3">
        Número final
        <Input
          id={`${idPrefix}numero-ate`}
          value={draft.numeroAte}
          onChange={(e) => setDraft((d) => ({ ...d, numeroAte: e.target.value }))}
          onBlur={(e) => onApply({ numeroAte: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onApply({ numeroAte: (e.target as HTMLInputElement).value });
          }}
          placeholder="Ex.: 15.000"
          className="mt-1 h-9 font-mono text-[12.5px]"
          aria-label="Número final"
        />
      </label>
    </div>
  );
}

export function ActsListPanel({ initial }: { initial: AdminListResponse }) {
  const { toast } = useToast();
  const { can } = useAdminAuth();
  const [data, setData] = useState(initial);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [mobileAdvancedOpen, setMobileAdvancedOpen] = useState(false);
  const [filterOptions, setFilterOptions] = useState<AdminFilterOptions | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllFiltered, setSelectAllFiltered] = useState(false);
  const loadSeq = useRef(0);

  useEffect(() => {
    getAdminFilterOptions()
      .then(setFilterOptions)
      .catch(() => {
        /* opções auxiliares — falha silenciosa */
      });
  }, []);

  const load = useCallback(
    async (f: Filters, p: number) => {
      const seq = ++loadSeq.current;
      setLoading(true);
      try {
        const next = await adminListActs(toListParams(f, p));
        if (seq !== loadSeq.current) return;
        setData(next);
        setPage(p);
      } catch (e) {
        if (seq !== loadSeq.current) return;
        toast(e instanceof Error ? e.message : 'Erro ao filtrar atos', 'danger');
      } finally {
        if (seq === loadSeq.current) setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (draft.norma !== filters.norma || draft.ementa !== filters.ementa) {
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
    setSelectedIds(new Set());
    setSelectAllFiltered(false);
    void load(EMPTY, 1);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectAllFiltered(false);
  };

  const toggleRow = (id: string) => {
    setSelectAllFiltered(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pageIds = data.items.map((a) => a.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id) || selectAllFiltered);

  const togglePageSelection = () => {
    if (selectAllFiltered) {
      setSelectAllFiltered(false);
      setSelectedIds(new Set());
      return;
    }
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of pageIds) next.delete(id);
        return next;
      });
      return;
    }
    if (data.totalPages > 1 || data.total > data.items.length) {
      const ok = window.confirm(
        `Selecionar todos os ${data.total} atos que casam com os filtros atuais? (não apenas esta página)`,
      );
      if (ok) {
        setSelectAllFiltered(true);
        setSelectedIds(new Set(pageIds));
        return;
      }
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of pageIds) next.add(id);
      return next;
    });
  };

  const handleBatchComplete = (result: BatchUpdateActsResult) => {
    toast(result.summary, result.skippedCount ? 'warn' : 'ok');
    if (result.skipped.length) {
      const detail = result.skipped
        .slice(0, 3)
        .map((s) => `${s.codigo}: ${s.reason}`)
        .join('; ');
      toast(
        result.skipped.length > 3
          ? `${detail}… (+${result.skipped.length - 3})`
          : detail,
        'warn',
      );
    }
    void load(filters, page);
  };

  const hasFilters = Object.values(filters).some(Boolean);
  const advancedCount = countAdvancedFilters(filters);

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

      <div className={cn('min-h-0 flex-1 overflow-auto p-6', (selectedIds.size > 0 || selectAllFiltered) && can('acts:write') && 'pb-24')}>
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Total de atos" value={data.kpis.total} />
          <KpiCard label="Vigentes" value={data.kpis.vigentes} />
          <KpiCard label="Aguardando revisão" value={data.kpis.emRevisao} />
          <KpiCard label="Publicados no mês" value={data.kpis.publicadosMes} />
        </div>

        {/* Filtros avançados — mobile */}
        <div className="mb-4 md:hidden">
          <Button
            type="button"
            variant="outlined"
            className="w-full"
            onClick={() => setMobileAdvancedOpen(true)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros avançados
            {advancedCount > 0 && (
              <Badge variant="info" className="ml-1 text-[10px]">
                {advancedCount}
              </Badge>
            )}
          </Button>
        </div>

        {mobileAdvancedOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden" role="presentation">
            <button
              type="button"
              className="absolute inset-0 bg-ink/40"
              aria-label="Fechar filtros avançados"
              onClick={() => setMobileAdvancedOpen(false)}
            />
            <aside
              role="dialog"
              aria-modal="true"
              aria-label="Filtros avançados"
              className="relative ml-auto flex h-full w-[min(100%,360px)] flex-col bg-surface shadow-lg pb-[env(safe-area-inset-bottom)]"
            >
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <h2 className="text-[15px] font-semibold text-ink">Filtros avançados</h2>
                <button
                  type="button"
                  onClick={() => setMobileAdvancedOpen(false)}
                  className="touch-target inline-flex items-center justify-center rounded-[10px] text-ink-3 hover:bg-surface-2"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <AdvancedFiltersForm
                  draft={draft}
                  setDraft={setDraft}
                  options={filterOptions}
                  onApply={applySelectFilters}
                  idPrefix="mobile-"
                />
              </div>
              <div className="border-t border-line p-4">
                <Button type="button" className="w-full" onClick={() => setMobileAdvancedOpen(false)}>
                  Aplicar
                </Button>
              </div>
            </aside>
          </div>
        )}

        {/* Filtros avançados — desktop */}
        <div className="mb-4 hidden rounded-[14px] border border-line bg-surface shadow-sm md:block">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
          >
            <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <SlidersHorizontal className="h-4 w-4 text-ink-3" />
              Filtros avançados
              {advancedCount > 0 && (
                <Badge variant="info" className="text-[10px]">
                  {advancedCount}
                </Badge>
              )}
            </span>
            <ChevronDown
              className={cn('h-4 w-4 text-ink-4 transition', advancedOpen && 'rotate-180')}
            />
          </button>
          {advancedOpen && (
            <div className="border-t border-line-2 px-4 pb-4 pt-3">
              <AdvancedFiltersForm
                draft={draft}
                setDraft={setDraft}
                options={filterOptions}
                onApply={applySelectFilters}
              />
            </div>
          )}
        </div>

        {/* Filtros empilhados em telas menores (acompanham a listagem sem scroll horizontal). */}
        <div className="mb-4 space-y-3 rounded-[14px] border border-line bg-surface p-4 shadow-sm md:hidden">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-ink">Filtros</p>
            {hasFilters && (
              <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" />
                Limpar
              </Button>
            )}
          </div>
          <Input
            value={draft.norma}
            onChange={(e) => setDraft((d) => ({ ...d, norma: e.target.value }))}
            placeholder="Filtrar norma…"
            className="h-9 text-[12.5px]"
            aria-label="Filtrar por norma"
          />
          <Input
            value={draft.ementa}
            onChange={(e) => setDraft((d) => ({ ...d, ementa: e.target.value }))}
            placeholder="Filtrar ementa…"
            className="h-9 text-[12.5px]"
            aria-label="Filtrar por ementa"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              value={draft.situacao}
              onChange={(e) => applySelectFilters({ situacao: e.target.value })}
              className={filterSelectClass(Boolean(draft.situacao))}
              aria-label="Filtrar por situação"
            >
              <option value="">Situação: todas</option>
              {SITUACOES.map((s) => (
                <option key={s} value={s}>
                  {SITUACAO_LABELS[s]}
                </option>
              ))}
            </Select>
            <Select
              value={draft.statusPublicacao}
              onChange={(e) => applySelectFilters({ statusPublicacao: e.target.value })}
              className={filterSelectClass(Boolean(draft.statusPublicacao))}
              aria-label="Filtrar por status"
            >
              {STATUS_OPTS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  Status: {o.label}
                </option>
              ))}
            </Select>
            <Select
              value={draft.etapaEditorial}
              onChange={(e) => applySelectFilters({ etapaEditorial: e.target.value })}
              className={filterSelectClass(Boolean(draft.etapaEditorial))}
              aria-label="Filtrar por estágio editorial"
            >
              <option value="">Estágio: todos</option>
              {ETAPAS_EDITORIAIS.map((e) => (
                <option key={e} value={e}>
                  {ETAPA_EDITORIAL_LABELS[e]}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block text-[11px] text-ink-3">
              Publicação — data inicial
              <Input
                type="date"
                value={draft.publicadoDe}
                onChange={(e) => applySelectFilters({ publicadoDe: e.target.value })}
                className={cn(
                  'mt-1 h-9 text-[12.5px] font-normal',
                  !draft.publicadoDe && 'text-ink-4',
                )}
                aria-label="Data inicial de publicação"
              />
            </label>
            <label className="block text-[11px] text-ink-3">
              Publicação — data final
              <Input
                type="date"
                value={draft.publicadoAte}
                onChange={(e) => applySelectFilters({ publicadoAte: e.target.value })}
                className={cn(
                  'mt-1 h-9 text-[12.5px] font-normal',
                  !draft.publicadoAte && 'text-ink-4',
                )}
                aria-label="Data final de publicação"
              />
            </label>
          </div>
        </div>

        <div className="overflow-x-auto rounded-[14px] border border-line bg-surface shadow-sm">
          <table className="w-full min-w-[1280px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-line-2 bg-surface-2">
                {can('acts:write') && (
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Selecionar atos da página"
                      checked={allPageSelected || selectAllFiltered}
                      onChange={togglePageSelection}
                      className="h-4 w-4 rounded border-line"
                    />
                  </th>
                )}
                <th className="text-section whitespace-nowrap px-4 py-3">Norma</th>
                <th className="text-section min-w-[180px] px-4 py-3">Ementa</th>
                <th className="text-section whitespace-nowrap px-4 py-3">Situação</th>
                <th className="text-section whitespace-nowrap px-4 py-3">Status</th>
                <th className="text-section whitespace-nowrap px-4 py-3">Estágio editorial</th>
                <th className="text-section min-w-[120px] px-4 py-3">Resp. estruturação</th>
                <th className="text-section min-w-[120px] px-4 py-3">Resp. revisão</th>
                <th className="text-section whitespace-nowrap px-4 py-3">Publicação</th>
                <th className="text-section whitespace-nowrap px-4 py-3">Ações</th>
              </tr>
              <tr className="hidden border-b border-line bg-surface md:table-row">
                {can('acts:write') && <th className="px-3 py-2" />}
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
                    className={filterSelectClass(Boolean(draft.situacao))}
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
                    className={filterSelectClass(Boolean(draft.statusPublicacao))}
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
                    className={filterSelectClass(Boolean(draft.etapaEditorial))}
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
                  <SearchableSelect
                    value={draft.responsavelEstruturacaoId}
                    onChange={(v) => applySelectFilters({ responsavelEstruturacaoId: v ?? '' })}
                    options={
                      filterOptions?.users.map((u) => ({
                        value: u.id,
                        label: u.nome,
                        searchText: `${u.nome} ${u.email}`,
                      })) ?? []
                    }
                    allLabel="Todos"
                    searchPlaceholder="Buscar…"
                    aria-label="Filtrar resp. estruturação"
                  />
                </th>
                <th className="px-3 py-2 align-top">
                  <SearchableSelect
                    value={draft.responsavelRevisaoId}
                    onChange={(v) => applySelectFilters({ responsavelRevisaoId: v ?? '' })}
                    options={
                      filterOptions?.users.map((u) => ({
                        value: u.id,
                        label: u.nome,
                        searchText: `${u.nome} ${u.email}`,
                      })) ?? []
                    }
                    allLabel="Todos"
                    searchPlaceholder="Buscar…"
                    aria-label="Filtrar resp. revisão"
                  />
                </th>
                <th className="px-3 py-2 align-top">
                  <div className="flex min-w-[168px] flex-col gap-1">
                    <Input
                      type="date"
                      value={draft.publicadoDe}
                      onChange={(e) => applySelectFilters({ publicadoDe: e.target.value })}
                      className={cn(
                        'h-9 text-[12.5px] font-normal',
                        !draft.publicadoDe && 'text-ink-4',
                      )}
                      aria-label="Data inicial de publicação"
                    />
                    <Input
                      type="date"
                      value={draft.publicadoAte}
                      onChange={(e) => applySelectFilters({ publicadoAte: e.target.value })}
                      className={cn(
                        'h-9 text-[12.5px] font-normal',
                        !draft.publicadoAte && 'text-ink-4',
                      )}
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
                  <td colSpan={can('acts:write') ? 10 : 9} className="px-4 py-8 text-center text-ink-3">
                    Filtrando…
                  </td>
                </tr>
              ) : data.items.length === 0 ? (
                <tr>
                  <td colSpan={can('acts:write') ? 10 : 9} className="px-4 py-8 text-center text-ink-3">
                    Nenhum ato encontrado com os filtros informados.
                  </td>
                </tr>
              ) : (
                data.items.map((act) => {
                  const etapa = act.etapaEditorial as EditorialStage | null | undefined;
                  const hasPublicPage = act.statusPublicacao === 'publicado';
                  const checked = selectAllFiltered || selectedIds.has(act.id);
                  return (
                  <tr key={act.id} className="border-b border-line-2 transition hover:bg-surface-2">
                    {can('acts:write') && (
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${act.codigo}`}
                          checked={checked}
                          onChange={() => toggleRow(act.id)}
                          className="h-4 w-4 rounded border-line"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 text-[13px] font-semibold text-brand">
                      {act.codigo}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-[13px] text-ink-2">{act.ementa}</td>
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
                      {etapa ? (
                        <Badge variant={ETAPA_BADGE_VARIANT[etapa] ?? 'neutral'}>
                          {ETAPA_EDITORIAL_LABELS[etapa] ?? etapa}
                        </Badge>
                      ) : (
                        <span className="text-[12px] text-ink-3">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-ink-2">
                      <span className={act.responsavelEstruturacao && !act.responsavelEstruturacao.ativo ? 'text-warn' : ''}>
                        {responsavelLabel(act.responsavelEstruturacao)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-ink-2">
                      <span className={act.responsavelRevisao && !act.responsavelRevisao.ativo ? 'text-warn' : ''}>
                        {responsavelLabel(act.responsavelRevisao)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12.5px] text-ink-3">
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
                        {hasPublicPage ? (
                          <Link href={actUrl(act.slug)} target="_blank">
                            <Button variant="ghost" size="xs">
                              <ExternalLink className="h-3.5 w-3.5" />
                              Ver público
                            </Button>
                          </Link>
                        ) : (
                          <Button
                            variant="ghost"
                            size="xs"
                            disabled
                            title="A consulta pública estará disponível após a publicação"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Ver público
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })
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
        {can('acts:write') && (selectedIds.size > 0 || selectAllFiltered) && (
          <ActBatchBar
            selectedCount={selectedIds.size}
            totalFiltered={data.total}
            selectAllFiltered={selectAllFiltered}
            onClear={clearSelection}
            onComplete={handleBatchComplete}
            filterOptions={filterOptions}
            listFilters={filtersToBatchPayload(filters)}
            selectedIds={[...selectedIds]}
          />
        )}
      </div>
    </>
  );
}
