'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import {
  batchUpdateActs,
  type AdminFilterOptions,
  type BatchUpdateActsPayload,
  type BatchUpdateActsResult,
} from '@/lib/admin-api';
import { cn } from '@/lib/format';
import type { ActUserRef } from '@/lib/types';

type BatchAction =
  | 'set_responsavel_estruturacao'
  | 'set_responsavel_revisao'
  | 'set_meio_publicacao'
  | 'set_signatario';

const ACTION_LABELS: Record<BatchAction, string> = {
  set_responsavel_estruturacao: 'Definir responsável pela estruturação',
  set_responsavel_revisao: 'Definir responsável pela revisão/publicação',
  set_meio_publicacao: 'Definir meio de publicação',
  set_signatario: 'Definir signatário',
};

function userOptions(users: ActUserRef[]) {
  return users
    .filter((u) => u.ativo)
    .map((u) => ({
      value: u.id,
      label: u.nome,
      searchText: `${u.nome} ${u.email}`,
    }));
}

export function ActBatchBar({
  selectedCount,
  totalFiltered,
  selectAllFiltered,
  onClear,
  onComplete,
  filterOptions,
  listFilters,
  selectedIds,
}: {
  selectedCount: number;
  totalFiltered: number;
  selectAllFiltered: boolean;
  onClear: () => void;
  onComplete: (result: BatchUpdateActsResult) => void;
  filterOptions: AdminFilterOptions | null;
  listFilters: BatchUpdateActsPayload;
  selectedIds: string[];
}) {
  const [actionOpen, setActionOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<BatchAction | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [responsavelEstruturacaoId, setResponsavelEstruturacaoId] = useState('');
  const [responsavelRevisaoId, setResponsavelRevisaoId] = useState('');
  const [meioPublicacaoId, setMeioPublicacaoId] = useState('');
  const [signatoryMode, setSignatoryMode] = useState<'append' | 'replace'>('append');
  const [signatoryId, setSignatoryId] = useState('');
  const [signatoryNome, setSignatoryNome] = useState('');
  const [signatoryCargo, setSignatoryCargo] = useState('');

  const users = filterOptions?.users ?? [];
  const meios = filterOptions?.meios ?? [];
  const signatarios = filterOptions?.signatarios ?? [];

  const effectiveCount = selectAllFiltered ? totalFiltered : selectedCount;

  const signatoryOptions = useMemo(
    () =>
      signatarios.map((nome) => ({
        value: nome,
        label: nome,
      })),
    [signatarios],
  );

  const openAction = (action: BatchAction) => {
    setPendingAction(action);
    setError(null);
    setActionOpen(false);
    setConfirmOpen(true);
  };

  const buildPayload = (): BatchUpdateActsPayload | null => {
    if (!pendingAction) return null;
    const base: BatchUpdateActsPayload = selectAllFiltered
      ? { selectAllFiltered: true, ...listFilters, action: pendingAction }
      : { actIds: selectedIds, action: pendingAction };

    if (pendingAction === 'set_responsavel_estruturacao') {
      base.responsavelEstruturacaoId = responsavelEstruturacaoId || null;
    } else if (pendingAction === 'set_responsavel_revisao') {
      base.responsavelRevisaoId = responsavelRevisaoId || null;
    } else if (pendingAction === 'set_meio_publicacao') {
      if (!meioPublicacaoId) return null;
      base.meioPublicacaoId = meioPublicacaoId;
    } else if (pendingAction === 'set_signatario') {
      if (!signatoryNome.trim() || !signatoryCargo.trim()) return null;
      base.signatory = {
        signatoryId: signatoryId || null,
        nome: signatoryNome.trim(),
        cargo: signatoryCargo.trim(),
        mode: signatoryMode,
      };
    }
    return base;
  };

  const canConfirm = Boolean(buildPayload());

  const execute = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setLoading(true);
    setError(null);
    try {
      const result = await batchUpdateActs(payload);
      setConfirmOpen(false);
      setPendingAction(null);
      onComplete(result);
      onClear();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro na operação em lote');
    } finally {
      setLoading(false);
    }
  };

  if (selectedCount === 0 && !selectAllFiltered) return null;

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface px-4 py-3 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink">
            <span className="font-semibold">
              {effectiveCount} ato{effectiveCount === 1 ? '' : 's'} selecionado
              {effectiveCount === 1 ? '' : 's'}
            </span>
            {selectAllFiltered && (
              <span className="text-ink-3">(todos os resultados filtrados)</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Button
                type="button"
                size="sm"
                variant="tonal"
                onClick={() => setActionOpen((v) => !v)}
              >
                Ações em lote
                <ChevronDown className={cn('h-4 w-4 transition', actionOpen && 'rotate-180')} />
              </Button>
              {actionOpen && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40 cursor-default"
                    aria-label="Fechar menu"
                    onClick={() => setActionOpen(false)}
                  />
                  <div className="absolute bottom-full left-0 z-50 mb-1 min-w-[280px] rounded-[12px] border border-line bg-surface py-1 shadow-lg">
                    {(Object.keys(ACTION_LABELS) as BatchAction[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        className="block w-full px-3 py-2 text-left text-[13px] text-ink hover:bg-surface-2"
                        onClick={() => openAction(key)}
                      >
                        {ACTION_LABELS[key]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={onClear}>
              <X className="h-4 w-4" />
              Limpar
            </Button>
          </div>
        </div>
      </div>

      {confirmOpen && pendingAction && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar ação em lote"
            className="w-full max-w-md rounded-[14px] border border-line bg-surface p-5 shadow-lg"
          >
            <h3 className="text-[15px] font-semibold text-ink">{ACTION_LABELS[pendingAction]}</h3>
            <p className="mt-1 text-[13px] text-ink-3">
              Confirmar em {effectiveCount} ato{effectiveCount === 1 ? '' : 's'}?
            </p>

            <div className="mt-4 space-y-3">
              {pendingAction === 'set_responsavel_estruturacao' && (
                <label className="block text-[11px] text-ink-3">
                  Responsável pela estruturação
                  <SearchableSelect
                    className="mt-1"
                    value={responsavelEstruturacaoId}
                    onChange={(v) => setResponsavelEstruturacaoId(v ?? '')}
                    options={userOptions(users)}
                    allLabel="Nenhum (remover)"
                    searchPlaceholder="Buscar usuário…"
                  />
                </label>
              )}
              {pendingAction === 'set_responsavel_revisao' && (
                <label className="block text-[11px] text-ink-3">
                  Responsável pela revisão e publicação
                  <SearchableSelect
                    className="mt-1"
                    value={responsavelRevisaoId}
                    onChange={(v) => setResponsavelRevisaoId(v ?? '')}
                    options={userOptions(users)}
                    allLabel="Nenhum (remover)"
                    searchPlaceholder="Buscar usuário…"
                  />
                </label>
              )}
              {pendingAction === 'set_meio_publicacao' && (
                <label className="block text-[11px] text-ink-3">
                  Meio de publicação
                  <Select
                    className="mt-1"
                    value={meioPublicacaoId}
                    onChange={(e) => setMeioPublicacaoId(e.target.value)}
                  >
                    <option value="">Selecione…</option>
                    {meios
                      .filter((m) => m.ativo)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nome}
                        </option>
                      ))}
                  </Select>
                </label>
              )}
              {pendingAction === 'set_signatario' && (
                <>
                  <label className="block text-[11px] text-ink-3">
                    Modo
                    <Select
                      className="mt-1"
                      value={signatoryMode}
                      onChange={(e) => setSignatoryMode(e.target.value as 'append' | 'replace')}
                    >
                      <option value="append">Acrescentar</option>
                      <option value="replace">Substituir</option>
                    </Select>
                  </label>
                  <label className="block text-[11px] text-ink-3">
                    Nome
                    <SearchableSelect
                      className="mt-1"
                      value={signatoryNome}
                      onChange={(v) => {
                        setSignatoryNome(v ?? '');
                        setSignatoryId('');
                      }}
                      options={signatoryOptions}
                      allLabel="Digitar manualmente abaixo"
                      searchPlaceholder="Buscar signatário…"
                    />
                    <Input
                      className="mt-1"
                      value={signatoryNome}
                      onChange={(e) => setSignatoryNome(e.target.value)}
                      placeholder="Nome do signatário"
                    />
                  </label>
                  <label className="block text-[11px] text-ink-3">
                    Cargo
                    <Input
                      className="mt-1"
                      value={signatoryCargo}
                      onChange={(e) => setSignatoryCargo(e.target.value)}
                      placeholder="Cargo"
                    />
                  </label>
                </>
              )}
            </div>

            {error && <p className="mt-3 text-[12px] text-danger">{error}</p>}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loading}
                onClick={() => {
                  setConfirmOpen(false);
                  setPendingAction(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={loading || !canConfirm}
                onClick={() => void execute()}
              >
                {loading ? 'Processando…' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
