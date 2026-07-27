'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Eye, FileSearch, Upload, X } from 'lucide-react';
import { AdminTopbar } from '@/components/admin/AdminShell';
import {
  ArchiveImportFileViewer,
  DEFAULT_COMPARE_PANEL_HEIGHT,
  MAX_COMPARE_PANEL_HEIGHT,
  MIN_COMPARE_PANEL_HEIGHT,
} from '@/components/admin/ArchiveImportFileViewer';
import { IdentifiedImportTextDialog } from '@/components/admin/IdentifiedImportTextDialog';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import {
  confirmArchiveImportBatch,
  getArchiveImportBatch,
  updateArchiveImportItem,
  uploadArchiveImportBatch,
  type ArchiveImportBatch,
  type ArchiveImportItem,
} from '@/lib/admin-api';
import { ACT_TYPE_LABELS, ACT_TYPES, cn, toDateInputValue } from '@/lib/format';
import type { ActType } from '@/lib/types';

const STATUS_LABEL: Record<string, string> = {
  processando: 'Processando',
  pronto: 'Pronto',
  baixa_confianca: 'Requer conferência',
  duplicata: 'Duplicata',
  erro: 'Erro',
  confirmado: 'Criado',
  ignorado: 'Ignorado',
  vinculado: 'Vinculado',
};

function isSelectable(item: ArchiveImportItem): boolean {
  if (item.status === 'pronto' || item.status === 'baixa_confianca') return true;
  if (item.status === 'duplicata' && item.resolucao) return true;
  return false;
}

function canConcludeRow(item: ArchiveImportItem): boolean {
  return isSelectable(item);
}

function confidenceTier(confianca: number): { label: string; className: string } {
  if (confianca >= 75) return { label: 'Alta', className: 'text-ok' };
  if (confianca >= 55) return { label: 'Média', className: 'text-warn' };
  return { label: 'Baixa', className: 'text-danger' };
}

function mergeBatchAfterConfirm(
  prev: ArchiveImportBatch,
  serverBatch: ArchiveImportBatch,
  confirmedIds: Set<string>,
): ArchiveImportBatch {
  const serverMap = new Map(serverBatch.items.map((i) => [i.id, i]));
  return {
    ...serverBatch,
    items: prev.items.map((local) =>
      confirmedIds.has(local.id) ? (serverMap.get(local.id) ?? local) : local,
    ),
  };
}

function mergeBatchAfterPatch(
  prev: ArchiveImportBatch,
  serverBatch: ArchiveImportBatch,
  patchedId: string,
): ArchiveImportBatch {
  const serverMap = new Map(serverBatch.items.map((i) => [i.id, i]));
  return {
    ...serverBatch,
    items: prev.items.map((local) =>
      local.id === patchedId ? (serverMap.get(local.id) ?? local) : local,
    ),
  };
}

export function ArchiveImportPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const batchId = searchParams.get('batch');

  const [batch, setBatch] = useState<ArchiveImportBatch | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [viewingItemId, setViewingItemId] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<'dados' | 'arquivo'>('dados');
  const [panelHeight, setPanelHeight] = useState(DEFAULT_COMPARE_PANEL_HEIGHT);
  const [splitPct, setSplitPct] = useState(42);
  const [textDialogItem, setTextDialogItem] = useState<ArchiveImportItem | null>(null);
  const [savingText, setSavingText] = useState(false);

  const load = useCallback(async (id: string) => {
    const data = await getArchiveImportBatch(id);
    setBatch(data);
    return data;
  }, []);

  useEffect(() => {
    if (!batchId) return;
    load(batchId).catch(() => toast('Lote não encontrado', 'danger'));
  }, [batchId, load, toast]);

  useEffect(() => {
    if (!batchId || !batch) return;
    if (batch.status !== 'processando' && !batch.counts.processando) return;
    const t = window.setInterval(() => {
      void load(batchId).catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(t);
  }, [batchId, batch, load]);

  const selectableIds = useMemo(
    () => batch?.items.filter(isSelectable).map((i) => i.id) ?? [],
    [batch?.items],
  );

  const allSelectableSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const someSelectableSelected =
    selectableIds.some((id) => selected.has(id)) && !allSelectableSelected;

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelectableSelected) {
        for (const id of selectableIds) next.delete(id);
      } else {
        for (const id of selectableIds) next.add(id);
      }
      return next;
    });
  };

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const data = await uploadArchiveImportBatch(Array.from(files));
      toast(`Lote com ${data.items.length} arquivo(s) enviado`, 'ok');
      router.replace(`/admin/importar?modo=acervo&batch=${data.id}`);
      setBatch(data);
      setSelected(new Set());
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro no upload', 'danger');
    } finally {
      setUploading(false);
    }
  };

  const patchItem = async (itemId: string, patch: Parameters<typeof updateArchiveImportItem>[2]) => {
    if (!batch) return;
    setBusyItem(itemId);
    try {
      const next = await updateArchiveImportItem(batch.id, itemId, patch);
      setBatch((prev) => (prev ? mergeBatchAfterPatch(prev, next, itemId) : next));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao atualizar item', 'danger');
    } finally {
      setBusyItem(null);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reportConfirmResults = (
    results: { itemId: string; ok: boolean; error?: string }[],
    items: ArchiveImportItem[],
  ) => {
    const ok = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);
    if (!failed.length) {
      toast(`${ok} ato(s) criado(s)/processado(s) com sucesso`, 'ok');
      return;
    }
    const names = failed
      .map((r) => {
        const item = items.find((i) => i.id === r.itemId);
        const err = r.error ? ` (${r.error})` : '';
        return `${item?.nomeArquivo ?? r.itemId}${err}`;
      })
      .join('; ');
    toast(`${ok} processado(s); falharam: ${names}`, 'warn');
  };

  const confirmItems = async (itemIds: string[]) => {
    if (!batch || itemIds.length === 0) return;
    setConfirming(true);
    try {
      const result = await confirmArchiveImportBatch(batch.id, itemIds);
      const confirmedIds = new Set(result.results.filter((r) => r.ok).map((r) => r.itemId));
      setBatch((prev) =>
        prev ? mergeBatchAfterConfirm(prev, result.batch, confirmedIds) : result.batch,
      );
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of itemIds) next.delete(id);
        return next;
      });
      reportConfirmResults(result.results, batch.items);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro na confirmação', 'danger');
    } finally {
      setConfirming(false);
    }
  };

  const confirm = () => void confirmItems([...selected]);

  const confirmOne = (itemId: string) => {
    setBusyItem(itemId);
    void confirmItems([itemId]).finally(() => setBusyItem(null));
  };

  const viewingItem = useMemo(
    () => batch?.items.find((i) => i.id === viewingItemId) ?? null,
    [batch?.items, viewingItemId],
  );

  const openViewer = (item: ArchiveImportItem) => {
    setViewingItemId(item.id);
    setViewerOpen(true);
    setMobilePane('arquivo');
  };

  const closeViewer = () => {
    setViewerOpen(false);
    setMobilePane('dados');
  };

  const saveIdentifiedText = async (text: string) => {
    if (!batch || !textDialogItem) return;
    setSavingText(true);
    try {
      const next = await updateArchiveImportItem(batch.id, textDialogItem.id, {
        textoIdentificadoImportacao: text,
      });
      setBatch((prev) =>
        prev ? mergeBatchAfterPatch(prev, next, textDialogItem.id) : next,
      );
      toast('Texto identificado salvo', 'ok');
      setTextDialogItem(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar texto', 'danger');
    } finally {
      setSavingText(false);
    }
  };

  const progressLabel = useMemo(() => {
    if (!batch) return null;
    return `${batch.counts.total - batch.counts.processando}/${batch.counts.total} processados`;
  }, [batch]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AdminTopbar
        sticky
        title="Importação de acervo"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/importar">
              <Button variant="ghost" size="sm">
                Trocar fluxo
              </Button>
            </Link>
            {batch && selected.size > 0 && (
              <Button size="sm" onClick={() => void confirm()} disabled={confirming}>
                {confirming ? 'Concluindo…' : `Concluir selecionados (${selected.size})`}
              </Button>
            )}
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {!batchId && (
          <label className="mb-8 flex cursor-pointer flex-col items-center justify-center rounded-[14px] border-2 border-dashed border-line bg-surface p-12 transition hover:border-brand hover:bg-brand-soft/30">
            <Upload className="mb-3 h-10 w-10 text-ink-4" />
            <p className="text-[15px] font-semibold text-ink">Selecionar vários DOCX ou PDF</p>
            <p className="mt-1 max-w-md text-center text-[13px] text-ink-3">
              Extração de metadados (tipo, número, data, ementa) e texto integral para busca.
              Sem estruturação de dispositivos. Até 100 arquivos por lote.
            </p>
            <input
              type="file"
              accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              multiple
              className="mt-4 text-[13px]"
              disabled={uploading}
              onChange={(e) => void onUpload(e.target.files)}
            />
            {uploading && <p className="mt-4 text-[13px] text-brand">Enviando lote…</p>}
          </label>
        )}

        {batch && (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3 text-[13px] text-ink-2">
              <Badge variant="info">{batch.status.replace('_', ' ')}</Badge>
              {progressLabel && <span>{progressLabel}</span>}
              <span>
                Prontos: {batch.counts.pronto} · Conferência: {batch.counts.baixa_confianca} ·
                Duplicatas: {batch.counts.duplicata} · Erros: {batch.counts.erro} · Criados:{' '}
                {batch.counts.confirmado}
              </span>
            </div>

            {viewerOpen && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line bg-surface-2 px-3 py-2">
                <div className="flex gap-1 lg:hidden">
                  <button
                    type="button"
                    className={cn(
                      'rounded-[8px] px-3 py-1.5 text-[12px] font-medium',
                      mobilePane === 'dados' ? 'bg-brand text-white' : 'text-ink-3',
                    )}
                    onClick={() => setMobilePane('dados')}
                  >
                    Dados
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'rounded-[8px] px-3 py-1.5 text-[12px] font-medium',
                      mobilePane === 'arquivo' ? 'bg-brand text-white' : 'text-ink-3',
                    )}
                    onClick={() => setMobilePane('arquivo')}
                  >
                    Arquivo
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="hidden items-center gap-2 text-[12px] text-ink-3 lg:flex">
                    Largura do arquivo
                    <input
                      type="range"
                      min={28}
                      max={60}
                      value={splitPct}
                      onChange={(e) => setSplitPct(Number(e.target.value))}
                      className="w-28"
                    />
                    <span className="w-8 tabular-nums text-ink-4">{splitPct}%</span>
                  </label>
                  <label className="flex items-center gap-2 text-[12px] text-ink-3">
                    Altura
                    <input
                      type="range"
                      min={MIN_COMPARE_PANEL_HEIGHT}
                      max={MAX_COMPARE_PANEL_HEIGHT}
                      step={20}
                      value={panelHeight}
                      onChange={(e) => setPanelHeight(Number(e.target.value))}
                      className="w-28"
                    />
                    <span className="w-12 tabular-nums text-ink-4">{panelHeight}px</span>
                  </label>
                  <Button size="xs" variant="ghost" onClick={closeViewer}>
                    <X className="h-3.5 w-3.5" />
                    Ocultar arquivo
                  </Button>
                </div>
              </div>
            )}

            <div
              className={cn(
                viewerOpen && viewingItem && 'flex flex-col gap-4 lg:flex-row lg:items-start',
              )}
              style={
                viewerOpen && viewingItem
                  ? { ['--archive-split' as string]: `${splitPct}%` }
                  : undefined
              }
            >
              {viewerOpen && viewingItem && batch && (
                <div
                  className={cn(
                    'min-h-0 min-w-0 w-full shrink-0 lg:w-[var(--archive-split)]',
                    mobilePane !== 'arquivo' && 'max-lg:hidden',
                  )}
                >
                  <ArchiveImportFileViewer
                    batchId={batch.id}
                    item={viewingItem}
                    heightPx={panelHeight}
                    onClose={closeViewer}
                  />
                </div>
              )}

              <div
                className={cn(
                  'min-w-0 flex-1',
                  viewerOpen && mobilePane !== 'dados' && 'max-lg:hidden',
                )}
              >
            <div className="overflow-x-auto rounded-[14px] border border-line bg-surface shadow-sm">
              <table className="w-full min-w-[1100px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line-2 bg-surface-2">
                    <th className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allSelectableSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelectableSelected;
                        }}
                        onChange={toggleAll}
                        disabled={selectableIds.length === 0}
                        aria-label="Selecionar todos os itens concluíveis"
                        title="Selecionar todos os itens prontos para conclusão"
                      />
                    </th>
                    <th className="px-3 py-2">Arquivo</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Nº</th>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2 min-w-[220px]">Ementa</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.items.map((item) => {
                    const editable = [
                      'pronto',
                      'baixa_confianca',
                      'duplicata',
                    ].includes(item.status);
                    const selectable = isSelectable(item);
                    const conf = confidenceTier(item.confianca);
                    return (
                      <tr
                        key={item.id}
                        className={cn(
                          'border-b border-line-2 align-top',
                          viewingItemId === item.id &&
                            viewerOpen &&
                            'bg-brand-soft/20 ring-1 ring-inset ring-brand/20',
                        )}
                      >
                        <td className="px-3 py-2">
                          {selectable ? (
                            <input
                              type="checkbox"
                              checked={selected.has(item.id)}
                              onChange={() => toggle(item.id)}
                              aria-label={`Selecionar ${item.nomeArquivo}`}
                            />
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="text-left font-medium text-brand hover:underline"
                            onClick={() => openViewer(item)}
                          >
                            {item.nomeArquivo}
                          </button>
                          <div className={`mt-0.5 text-[11px] ${conf.className}`}>
                            Confiança {conf.label} ({item.confianca}%)
                          </div>
                          {item.erroMensagem && (
                            <p className="mt-1 text-[11px] text-danger">{item.erroMensagem}</p>
                          )}
                          {item.existingAct && (
                            <p className="mt-1 text-[11px] text-warn">
                              Possível duplicata:{' '}
                              <Link
                                href={`/admin/atos/${item.existingAct.id}/editor`}
                                className="underline"
                              >
                                {item.existingAct.codigo}
                              </Link>
                            </p>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <Select
                            value={item.tipo ?? ''}
                            disabled={!editable || busyItem === item.id}
                            className="h-9 text-[12px]"
                            onChange={(e) =>
                              void patchItem(item.id, {
                                tipo: (e.target.value || null) as ActType | null,
                              })
                            }
                          >
                            <option value="">—</option>
                            {ACT_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {ACT_TYPE_LABELS[t]}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            type="number"
                            className="h-9 w-20 font-mono text-[12px]"
                            value={item.numero ?? ''}
                            disabled={!editable || busyItem === item.id}
                            onChange={(e) =>
                              void patchItem(item.id, {
                                numero: e.target.value ? Number(e.target.value) : null,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <Input
                            type="date"
                            className="h-9 font-mono text-[12px]"
                            value={toDateInputValue(item.dataAto)}
                            disabled={!editable || busyItem === item.id}
                            onChange={(e) =>
                              void patchItem(item.id, {
                                dataAto: e.target.value || null,
                                ano: e.target.value
                                  ? new Date(e.target.value).getUTCFullYear()
                                  : item.ano,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <textarea
                            className="min-h-[64px] w-full rounded-[8px] border border-line bg-surface px-2 py-1.5 text-[12px] text-ink"
                            disabled={!editable || busyItem === item.id}
                            defaultValue={item.ementa ?? ''}
                            key={`${item.id}-ementa-${item.confianca}-${(item.ementa ?? '').length}`}
                            onBlur={(e) => {
                              if (e.target.value !== (item.ementa ?? '')) {
                                void patchItem(item.id, { ementa: e.target.value });
                              }
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            variant={
                              item.status === 'erro'
                                ? 'danger'
                                : item.status === 'duplicata' || item.status === 'baixa_confianca'
                                  ? 'warn'
                                  : item.status === 'confirmado' || item.status === 'vinculado'
                                    ? 'ok'
                                    : 'neutral'
                            }
                          >
                            {STATUS_LABEL[item.status] ?? item.status}
                          </Badge>
                          {item.actId && (
                            <Link
                              href={`/admin/atos/${item.actId}/editor`}
                              className="mt-1 flex items-center gap-1 text-[11px] text-brand hover:underline"
                            >
                              Abrir ato <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-col gap-1">
                            {item.fileUrl && item.status !== 'processando' && (
                              <Button
                                size="xs"
                                variant="ghost"
                                className={cn(
                                  viewingItemId === item.id && viewerOpen && 'bg-brand-soft text-brand',
                                )}
                                onClick={() => openViewer(item)}
                              >
                                <Eye className="h-3 w-3" />
                                Visualizar
                              </Button>
                            )}
                            {(item.textoIdentificadoImportacao ||
                              item.textoIdentificadoAusente ||
                              item.status !== 'processando') && (
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => setTextDialogItem(item)}
                              >
                                <FileSearch className="h-3 w-3" />
                                Ver texto identificado
                              </Button>
                            )}
                          {canConcludeRow(item) && (
                            <Button
                              size="xs"
                              variant="outlined"
                              disabled={busyItem === item.id || confirming}
                              onClick={() => confirmOne(item.id)}
                            >
                              {busyItem === item.id ? 'Concluindo…' : 'Concluir'}
                            </Button>
                          )}
                          {item.status === 'duplicata' && (
                            <div className="mt-1 flex flex-col gap-1">
                              <Button
                                size="xs"
                                variant="ghost"
                                disabled={busyItem === item.id}
                                onClick={() => void patchItem(item.id, { resolucao: 'ignore' })}
                              >
                                Ignorar
                              </Button>
                              <Button
                                size="xs"
                                variant="ghost"
                                disabled={busyItem === item.id || !item.existingAct}
                                onClick={() => void patchItem(item.id, { resolucao: 'link' })}
                              >
                                Vincular
                              </Button>
                              <Button
                                size="xs"
                                variant="outlined"
                                disabled={busyItem === item.id}
                                onClick={() => void patchItem(item.id, { resolucao: 'create' })}
                              >
                                Criar mesmo assim
                              </Button>
                              {item.resolucao && (
                                <span className="text-[10px] text-ink-4">
                                  Resolução: {item.resolucao}
                                </span>
                              )}
                            </div>
                          )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
              </div>
            </div>

            <IdentifiedImportTextDialog
              open={Boolean(textDialogItem)}
              onClose={() => setTextDialogItem(null)}
              filename={textDialogItem?.nomeArquivo}
              origem={textDialogItem?.textoIdentificadoOrigem}
              texto={textDialogItem?.textoIdentificadoImportacao}
              ausente={textDialogItem?.textoIdentificadoAusente}
              saving={savingText}
              onSave={
                textDialogItem &&
                ['pronto', 'baixa_confianca', 'duplicata'].includes(textDialogItem.status)
                  ? saveIdentifiedText
                  : undefined
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
