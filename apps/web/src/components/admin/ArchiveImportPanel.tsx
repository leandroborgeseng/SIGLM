'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Upload } from 'lucide-react';
import { AdminTopbar } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import {
  confirmArchiveImportBatch,
  getArchiveImportBatch,
  getArchiveImportItemFileUrl,
  updateArchiveImportItem,
  uploadArchiveImportBatch,
  type ArchiveImportBatch,
  type ArchiveImportItem,
} from '@/lib/admin-api';
import { ACT_TYPE_LABELS, ACT_TYPES, toDateInputValue } from '@/lib/format';
import type { ActType } from '@/lib/types';

const STATUS_LABEL: Record<string, string> = {
  processando: 'Processando',
  pronto: 'Pronto',
  baixa_confianca: 'Baixa confiança',
  duplicata: 'Duplicata',
  erro: 'Erro',
  confirmado: 'Confirmado',
  ignorado: 'Ignorado',
  vinculado: 'Vinculado',
};

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

  useEffect(() => {
    if (!batch) return;
    const eligible = batch.items.filter((i) =>
      ['pronto', 'baixa_confianca', 'duplicata'].includes(i.status),
    );
    setSelected(new Set(eligible.map((i) => i.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao trocar de lote
  }, [batch?.id]);

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const data = await uploadArchiveImportBatch(Array.from(files));
      toast(`Lote com ${data.items.length} arquivo(s) enviado`, 'ok');
      router.replace(`/admin/importar?modo=acervo&batch=${data.id}`);
      setBatch(data);
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
      setBatch(next);
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

  const confirm = async () => {
    if (!batch || selected.size === 0) return;
    setConfirming(true);
    try {
      const result = await confirmArchiveImportBatch(batch.id, [...selected]);
      setBatch(result.batch);
      const ok = result.results.filter((r) => r.ok).length;
      const fail = result.results.filter((r) => !r.ok).length;
      toast(
        fail
          ? `${ok} ato(s) processado(s); ${fail} com erro`
          : `${ok} ato(s) criado(s)/processado(s) com sucesso`,
        fail ? 'warn' : 'ok',
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro na confirmação', 'danger');
    } finally {
      setConfirming(false);
    }
  };

  const openFile = async (item: ArchiveImportItem) => {
    if (!batch) return;
    try {
      const url = await getArchiveImportItemFileUrl(batch.id, item.id);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast('Não foi possível abrir o arquivo', 'danger');
    }
  };

  const progressLabel = useMemo(() => {
    if (!batch) return null;
    const done =
      batch.counts.total -
      batch.counts.processando -
      (batch.status === 'processando' ? 0 : 0);
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
                {confirming ? 'Confirmando…' : `Confirmar selecionados (${selected.size})`}
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
              Extração apenas de dados básicos (tipo, número, data, ementa). Sem estruturação de
              dispositivos. Até 100 arquivos por lote.
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

            <div className="overflow-x-auto rounded-[14px] border border-line bg-surface shadow-sm">
              <table className="w-full min-w-[1100px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line-2 bg-surface-2">
                    <th className="px-3 py-2">Sel.</th>
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
                    return (
                      <tr key={item.id} className="border-b border-line-2 align-top">
                        <td className="px-3 py-2">
                          {editable ? (
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
                            onClick={() => void openFile(item)}
                          >
                            {item.nomeArquivo}
                          </button>
                          <div className="mt-0.5 text-[11px] text-ink-4">
                            Confiança: {item.confianca}%
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
                          {item.status === 'duplicata' && (
                            <div className="flex flex-col gap-1">
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
