'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { AdminTopbar } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import {
  confirmImport,
  fetchDocxPreviewHtml,
  fetchImportFileUrl,
  getImport,
  reprocessImport,
  uploadImport,
  type ImportDetail,
} from '@/lib/admin-api';
import { ACT_TYPE_LABELS, ACT_TYPES } from '@/lib/format';
import type { ActType } from '@/lib/types';
import { UNIT_TYPE_LABELS } from '@/lib/unit-hierarchy';

const STEPS = ['Upload', 'Conferência', 'Publicação'];

export function ImportPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const importId = searchParams.get('id');

  const [imp, setImp] = useState<ImportDetail | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [docxPreviewHtml, setDocxPreviewHtml] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [meta, setMeta] = useState({ tipo: 'lei', numero: '', ano: String(new Date().getFullYear()), ementa: '' });
  const [efeitosAceitos, setEfeitosAceitos] = useState<Set<string>>(new Set());
  const metaAppliedFor = useRef<string | null>(null);
  const effectsInitFor = useRef<string | null>(null);

  const applyDetectedMeta = useCallback((data: ImportDetail) => {
    const detected = data.estruturaDetectada?.metadados;
    const ementaBlock = data.estruturaDetectada?.blocos.find((b) => b.tipo === 'ementa');
    const tipo =
      detected?.tipo && ACT_TYPES.includes(detected.tipo as ActType)
        ? detected.tipo
        : 'lei';

    setMeta({
      tipo,
      numero: detected?.numero != null ? String(detected.numero) : '',
      ano:
        detected?.ano != null
          ? String(detected.ano)
          : String(new Date().getFullYear()),
      ementa: detected?.ementa ?? ementaBlock?.texto ?? '',
    });
  }, []);

  const load = useCallback(async (id: string) => {
    const data = await getImport(id);
    setImp(data);
    return data;
  }, []);

  useEffect(() => {
    metaAppliedFor.current = null;
    effectsInitFor.current = null;
  }, [importId]);

  useEffect(() => {
    if (!imp?.estruturaDetectada?.efeitosSugeridos) return;
    if (effectsInitFor.current === imp.id) return;
    effectsInitFor.current = imp.id;
    const ids = imp.estruturaDetectada.efeitosSugeridos
      .filter((e) => e.aceito)
      .map((e) => e.id);
    setEfeitosAceitos(new Set(ids));
  }, [imp?.id, imp?.estruturaDetectada?.efeitosSugeridos]);

  useEffect(() => {
    if (!imp?.estruturaDetectada) return;
    if (metaAppliedFor.current === imp.id) return;
    metaAppliedFor.current = imp.id;
    applyDetectedMeta(imp);
  }, [imp?.id, imp?.estruturaDetectada, applyDetectedMeta]);

  useEffect(() => {
    if (importId) load(importId).catch(() => toast('Importação não encontrada', 'danger'));
  }, [importId, load, toast]);

  useEffect(() => {
    if (!importId || !imp) return;
    const waiting =
      imp.status === 'processando' ||
      (imp.status === 'upload' && imp.formato === 'pdf_ocr' && imp.ocrResults.length === 0);
    if (!waiting) return;
    const timer = setInterval(() => {
      load(importId).catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, [importId, imp, load]);

  useEffect(() => {
    if (!imp?.id || imp.formato !== 'docx') {
      setDocxPreviewHtml(null);
      return;
    }
    fetchDocxPreviewHtml(imp.id)
      .then(setDocxPreviewHtml)
      .catch(() => toast('Preview DOCX indisponível', 'warn'));
  }, [imp?.id, imp?.formato, toast]);

  useEffect(() => {
    if (!imp?.id || !imp.formato.includes('pdf')) {
      setFilePreviewUrl(null);
      return;
    }
    let url: string | null = null;
    fetchImportFileUrl(imp.id)
      .then((u) => {
        url = u;
        setFilePreviewUrl(u);
      })
      .catch(() => toast('Preview do PDF indisponível', 'warn'));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [imp?.id, imp?.formato, toast]);

  const onFile = async (file: File) => {
    setUploading(true);
    try {
      const data = await uploadImport(file);
      if (data.status === 'processando') {
        toast('Processando arquivo em segundo plano...', 'ok');
        router.push(`/admin/importar?id=${data.id}`);
        setImp(data);
        return;
      }
      if (data.needsOcrReview) {
        toast('PDF digitalizado — revise o OCR antes de continuar', 'warn');
        router.push(`/admin/ocr?importId=${data.id}`);
        return;
      }
      toast('Arquivo processado — confira a estrutura', 'ok');
      router.push(`/admin/importar?id=${data.id}`);
      setImp(data);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro no upload', 'danger');
    } finally {
      setUploading(false);
    }
  };

  const handleReprocess = async () => {
    if (!imp) return;
    setReprocessing(true);
    metaAppliedFor.current = null;
    try {
      const data = await reprocessImport(imp.id);
      setImp(data);
      toast('Reprocessando arquivo...', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao reprocessar', 'danger');
    } finally {
      setReprocessing(false);
    }
  };

  const handleConfirm = async () => {
    if (!imp) return;
    setConfirming(true);
    try {
      const result = await confirmImport(imp.id, {
        tipo: meta.tipo,
        numero: meta.numero ? Number(meta.numero) : undefined,
        ano: Number(meta.ano),
        ementa: meta.ementa || undefined,
        efeitosAceitos: [...efeitosAceitos],
      });
      toast(`Rascunho criado: ${result.codigo}`, 'ok');
      router.push(result.editorUrl);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao confirmar', 'danger');
    } finally {
      setConfirming(false);
    }
  };

  const stepIndex = !imp
    ? 0
    : imp.status === 'processando'
      ? 0
      : imp.needsOcrReview
        ? 0
        : imp.status === 'conferencia'
          ? 1
          : imp.status === 'rascunho'
            ? 2
            : 0;

  const readyForConference = Boolean(imp?.estruturaDetectada?.blocos?.length);
  const waitingProcessing = imp?.status === 'processando';
  const failedProcessing = imp?.status === 'erro';

  return (
    <>
      <AdminTopbar title="Importação e conferência" />

      <div className="flex-1 overflow-auto p-6">
        <div className="mb-8 flex gap-2">
          {STEPS.map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold ${
                  i <= stepIndex ? 'bg-brand text-white' : 'bg-muted-bg text-muted'
                }`}
              >
                {i + 1}
              </span>
              <span className={`text-[13px] font-medium ${i <= stepIndex ? 'text-brand' : 'text-ink-3'}`}>
                {step}
              </span>
              {i < STEPS.length - 1 && <span className="mx-2 text-ink-4">→</span>}
            </div>
          ))}
        </div>

        {!imp && (
          <label className="mb-8 flex cursor-pointer flex-col items-center justify-center rounded-[14px] border-2 border-dashed border-line bg-surface p-12 transition hover:border-brand hover:bg-brand-soft/30">
            <Upload className="mb-3 h-10 w-10 text-ink-4" />
            <p className="text-[15px] font-semibold text-ink">Enviar DOCX ou PDF</p>
            <p className="mt-1 text-[13px] text-ink-3">PDF digitalizado será processado com OCR automaticamente</p>
            <input
              type="file"
              accept=".docx,.pdf"
              className="hidden"
              disabled={uploading}
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            {uploading && <p className="mt-4 text-[13px] text-brand">Processando...</p>}
          </label>
        )}

        {imp && waitingProcessing && (
          <div className="mb-6 rounded-[14px] border border-brand-soft bg-brand-soft/40 px-4 py-3 text-[13px] text-brand">
            Processando arquivo (extração/OCR). Esta página atualiza automaticamente.
          </div>
        )}

        {imp && failedProcessing && (
          <div className="mb-6 rounded-[14px] border border-danger-bd bg-danger-bg px-4 py-3 text-[13px] text-danger">
            <p>Falha ao processar o arquivo. Tente reprocessar ou envie outro documento.</p>
            {imp.lib?.startsWith('erro:') && (
              <p className="mt-2 font-mono text-[12px] opacity-90">{imp.lib.replace(/^erro:\s*/, '')}</p>
            )}
          </div>
        )}

        {imp && imp.needsOcrReview && (
          <div className="mb-6 flex flex-col gap-3 rounded-[14px] border border-warn-bd bg-warn-bg px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[13px] text-warn">
              <strong>PDF digitalizado detectado.</strong> Revise o texto reconhecido por OCR antes da conferência.
            </div>
            <Link href={`/admin/ocr?importId=${imp.id}`}>
              <Button>Ir para revisão OCR →</Button>
            </Link>
          </div>
        )}

        {imp && !waitingProcessing && !failedProcessing && !imp.needsOcrReview && readyForConference && (
          <div className="mb-6 rounded-[14px] border border-ok-bd bg-ok-bg px-4 py-3 text-[13px] text-ok">
            Estrutura identificada — revise os blocos abaixo e clique em <strong>Confirmar e salvar como rascunho</strong>.
          </div>
        )}

        {imp && (
          <>
            <div className="mb-4 inline-flex items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2">
              <span className="font-mono text-[13px] text-ink">{imp.arquivoOriginal}</span>
              {imp.lib && <Badge variant="info">{imp.lib}</Badge>}
              {imp.formato === 'pdf_ocr' && <Badge variant="warn">OCR</Badge>}
            </div>

            <div className="mb-6 grid gap-4 rounded-[14px] border border-line bg-surface p-5 sm:grid-cols-4">
              {imp.estruturaDetectada?.metadados?.tituloCompleto && (
                <p className="sm:col-span-4 text-[12px] text-ink-3">
                  Título identificado:{' '}
                  <span className="font-semibold text-ink">
                    {imp.estruturaDetectada.metadados.tituloCompleto}
                  </span>
                  {imp.estruturaDetectada.metadados.confianca > 0 && (
                    <span className="ml-2 font-mono text-ink-4">
                      ({imp.estruturaDetectada.metadados.confianca}% confiança)
                    </span>
                  )}
                </p>
              )}
              <div>
                <label className="mb-1 block text-[12px] text-ink-3">Tipo</label>
                <Select value={meta.tipo} onChange={(e) => setMeta({ ...meta, tipo: e.target.value })}>
                  {ACT_TYPES.map((t) => (
                    <option key={t} value={t}>{ACT_TYPE_LABELS[t]}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-[12px] text-ink-3">Número</label>
                <Input value={meta.numero} onChange={(e) => setMeta({ ...meta, numero: e.target.value })} placeholder="Auto" className="font-mono" />
              </div>
              <div>
                <label className="mb-1 block text-[12px] text-ink-3">Ano</label>
                <Input value={meta.ano} onChange={(e) => setMeta({ ...meta, ano: e.target.value })} className="font-mono" />
              </div>
              <div>
                <label className="mb-1 block text-[12px] text-ink-3">Ementa</label>
                <Input value={meta.ementa} onChange={(e) => setMeta({ ...meta, ementa: e.target.value })} />
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-[14px] border border-line bg-surface p-5">
                <h2 className="text-section mb-4">Arquivo original</h2>
                {imp.formato.includes('pdf') ? (
                  filePreviewUrl ? (
                    <iframe
                      src={filePreviewUrl}
                      className="h-64 w-full rounded-[10px] border border-line-2 bg-surface-2"
                      title="Preview PDF"
                    />
                  ) : (
                    <div className="flex h-64 items-center justify-center rounded-[10px] bg-surface-2 text-[13px] text-ink-3">
                      Carregando preview...
                    </div>
                  )
                ) : imp.formato === 'docx' ? (
                  docxPreviewHtml ? (
                    <iframe
                      srcDoc={docxPreviewHtml}
                      className="h-64 w-full rounded-[10px] border border-line-2 bg-surface"
                      title="Preview DOCX"
                    />
                  ) : (
                    <div className="flex h-64 items-center justify-center rounded-[10px] bg-surface-2 text-[13px] text-ink-3">
                      Carregando preview...
                    </div>
                  )
                ) : (
                  <div className="flex h-64 items-center justify-center rounded-[10px] bg-surface-2 text-[13px] text-ink-3">
                    Preview indisponível para este formato
                  </div>
                )}
              </div>
              <div className="rounded-[14px] border border-line bg-surface p-5">
                <h2 className="text-section mb-4">Estrutura identificada</h2>
                {imp.estruturaDetectada ? (
                  <ul className="space-y-2">
                    {imp.estruturaDetectada.blocos.map((item) => (
                      <li
                        key={`${item.tag}-${item.ordem}`}
                        className={`rounded-[10px] border px-3 py-2 ${
                          item.confianca < 80 ? 'border-warn-bd bg-warn-bg' : 'border-line-2 bg-surface-2'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[13px] font-semibold text-ink">
                                {item.tag}
                              </span>
                              <Badge variant="info" className="text-[10px]">
                                {UNIT_TYPE_LABELS[item.tipo as keyof typeof UNIT_TYPE_LABELS] ??
                                  item.tipo}
                              </Badge>
                            </div>
                            {item.texto && (
                              <p className="mt-1 line-clamp-2 text-[12px] text-ink-3">{item.texto}</p>
                            )}
                          </div>
                          <span className="shrink-0 font-mono text-[12px] text-ink-3">
                            {item.confianca}%
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-ink-3">
                    {waitingProcessing
                      ? 'Extraindo texto e identificando dispositivos...'
                      : imp.needsOcrReview
                        ? 'Aguardando revisão OCR — use o botão acima.'
                        : failedProcessing
                          ? 'Processamento falhou — use Reprocessar.'
                          : 'Nenhuma estrutura identificada neste arquivo.'}
                  </p>
                )}
                <p className="mt-3 text-[12px] text-warn">Revise manualmente trechos com confiança &lt; 80%</p>
              </div>
            </div>

            {(imp.estruturaDetectada?.efeitosSugeridos?.length ?? 0) > 0 && (
              <div className="mt-6 rounded-[12px] border border-line bg-surface p-4">
                <h3 className="mb-2 text-[14px] font-semibold text-ink">
                  Efeitos legislativos sugeridos
                </h3>
                <p className="mb-3 text-[12px] text-ink-3">
                  Cláusulas alteradoras detectadas automaticamente. Marque as que deseja vincular ao
                  rascunho.
                </p>
                <ul className="space-y-2">
                  {imp.estruturaDetectada!.efeitosSugeridos!.map((fx) => (
                    <li
                      key={fx.id}
                      className={`rounded-[10px] border px-3 py-2 ${
                        fx.confianca < 70 ? 'border-warn-bd bg-warn-bg' : 'border-line-2 bg-surface-2'
                      }`}
                    >
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={efeitosAceitos.has(fx.id)}
                          onChange={(e) => {
                            setEfeitosAceitos((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(fx.id);
                              else next.delete(fx.id);
                              return next;
                            });
                          }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <Badge variant="info" className="text-[10px]">
                              {fx.tipoEfeito.replace(/_/g, ' ')}
                            </Badge>
                            <span className="font-mono text-[12px] text-ink">
                              {fx.sourceTag} → {fx.normaCodigo ?? 'Norma?'}
                              {fx.targetIdentificacao ? ` / ${fx.targetIdentificacao}` : ''}
                            </span>
                            <span className="font-mono text-[11px] text-ink-4">{fx.confianca}%</span>
                          </span>
                          <p className="mt-1 line-clamp-2 text-[12px] text-ink-3">{fx.trecho}</p>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 flex gap-2">
              {imp.actId ? (
                <Link href={`/admin/atos/${imp.actId}/editor`}>
                  <Button variant="outlined">Corrigir no editor</Button>
                </Link>
              ) : (
                <>
                  <Button variant="outlined" onClick={() => router.push('/admin/importar')}>
                    Novo upload
                  </Button>
                  {(failedProcessing || (!readyForConference && !waitingProcessing && !imp.needsOcrReview)) && (
                    <Button variant="outlined" onClick={handleReprocess} disabled={reprocessing}>
                      {reprocessing ? 'Reprocessando...' : 'Reprocessar arquivo'}
                    </Button>
                  )}
                  <Button
                    onClick={handleConfirm}
                    disabled={confirming || !readyForConference || imp.needsOcrReview || waitingProcessing}
                  >
                    {confirming ? 'Salvando...' : 'Confirmar e salvar como rascunho'}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
