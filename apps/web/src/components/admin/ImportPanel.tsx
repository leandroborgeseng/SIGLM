'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Upload } from 'lucide-react';
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
  updateImportStructure,
  uploadImport,
  type ImportDetail,
} from '@/lib/admin-api';
import { ACT_TYPE_LABELS, ACT_TYPES } from '@/lib/format';
import type { ActType, UnitType } from '@/lib/types';
import {
  DIVISION_TYPES,
  HIERARCHY_TYPES,
  UNIT_TYPE_LABELS,
} from '@/lib/unit-hierarchy';

const STEPS = ['Upload', 'Conferência', 'Publicação'];
const DEFAULT_PANEL_HEIGHT = 780;
const MIN_PANEL_HEIGHT = 360;
const MAX_PANEL_HEIGHT = 1400;
const DEFAULT_SPLIT_PCT = 50;

const EDITABLE_TYPES: UnitType[] = [
  ...HIERARCHY_TYPES,
  ...DIVISION_TYPES,
  'preambulo',
  'ementa',
  'texto_simples',
];

type StructureBlock = {
  tag: string;
  tipo: string;
  texto: string;
  confianca: number;
  ordem: number;
  parentOrdem?: number | null;
  formatacao?: {
    align?: 'left' | 'center' | 'right' | 'justify';
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    letterSpacing?: 'normal' | 'expanded';
  } | null;
};

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
  const [savingStructure, setSavingStructure] = useState(false);
  const [meta, setMeta] = useState({
    tipo: 'lei',
    numero: '',
    dataAto: '',
    ano: String(new Date().getFullYear()),
    ementa: '',
  });
  const [blocos, setBlocos] = useState<StructureBlock[]>([]);
  const [dirty, setDirty] = useState(false);
  const [editingOrdem, setEditingOrdem] = useState<number | null>(null);
  const [efeitosAceitos, setEfeitosAceitos] = useState<Set<string>>(new Set());
  const [splitPct, setSplitPct] = useState(DEFAULT_SPLIT_PCT);
  const [panelHeight, setPanelHeight] = useState(DEFAULT_PANEL_HEIGHT);
  const metaAppliedFor = useRef<string | null>(null);
  const effectsInitFor = useRef<string | null>(null);
  const structureInitFor = useRef<string | null>(null);

  const applyDetectedMeta = useCallback((data: ImportDetail) => {
    const detected = data.estruturaDetectada?.metadados;
    const ementaBlock = data.estruturaDetectada?.blocos.find((b) => b.tipo === 'ementa');
    const tipo =
      detected?.tipo && ACT_TYPES.includes(detected.tipo as ActType)
        ? detected.tipo
        : 'lei';

    const ano =
      detected?.ano != null
        ? String(detected.ano)
        : String(new Date().getFullYear());
    const dataAto =
      detected?.dataAto
        ? String(detected.dataAto).slice(0, 10)
        : detected?.ano != null
          ? `${detected.ano}-01-01`
          : '';
    setMeta({
      tipo,
      numero: detected?.numero != null ? String(detected.numero) : '',
      dataAto,
      ano: dataAto ? String(new Date(dataAto).getUTCFullYear()) : ano,
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
    structureInitFor.current = null;
    setDirty(false);
    setEditingOrdem(null);
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
    if (!imp?.estruturaDetectada?.blocos) return;
    if (structureInitFor.current === imp.id && dirty) return;
    if (structureInitFor.current === imp.id) return;
    structureInitFor.current = imp.id;
    setBlocos(
      imp.estruturaDetectada.blocos.map((b, i) => ({
        tag: b.tag,
        tipo: b.tipo,
        texto: b.texto,
        confianca: b.confianca,
        ordem: i,
        parentOrdem: (b as StructureBlock).parentOrdem ?? null,
        formatacao: (b as StructureBlock).formatacao ?? null,
      })),
    );
    setDirty(false);
  }, [imp?.id, imp?.estruturaDetectada, dirty]);

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

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const updateBloco = (ordem: number, patch: Partial<StructureBlock>) => {
    setBlocos((prev) =>
      prev.map((b) => (b.ordem === ordem ? { ...b, ...patch } : b)),
    );
    setDirty(true);
  };

  const persistStructure = async () => {
    if (!imp || !dirty) return;
    setSavingStructure(true);
    try {
      const data = await updateImportStructure(
        imp.id,
        blocos.map((b, i) => ({ ...b, ordem: i })),
      );
      setImp(data);
      setDirty(false);
      toast('Correções da estrutura salvas', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar estrutura', 'danger');
    } finally {
      setSavingStructure(false);
    }
  };

  const onFile = async (file: File) => {
    if (dirty && !window.confirm('Há alterações não salvas. Continuar e descartá-las?')) return;
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
    if (dirty && !window.confirm('Há alterações não salvas. Reprocessar e descartá-las?')) return;
    setReprocessing(true);
    metaAppliedFor.current = null;
    structureInitFor.current = null;
    try {
      const data = await reprocessImport(imp.id);
      setImp(data);
      setDirty(false);
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
      if (dirty) {
        await updateImportStructure(
          imp.id,
          blocos.map((b, i) => ({ ...b, ordem: i })),
        );
      }
      const ano = meta.dataAto
        ? new Date(meta.dataAto).getUTCFullYear()
        : Number(meta.ano) || new Date().getFullYear();
      const result = await confirmImport(imp.id, {
        tipo: meta.tipo,
        numero: meta.numero ? Number(meta.numero) : undefined,
        ano,
        dataAto: meta.dataAto || undefined,
        ementa: meta.ementa || undefined,
        efeitosAceitos: [...efeitosAceitos],
        blocos: blocos.map((b, i) => ({ ...b, ordem: i })),
      });
      setDirty(false);
      toast(`Rascunho criado: ${result.codigo}`, 'ok');
      router.push(result.editorUrl);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao confirmar', 'danger');
    } finally {
      setConfirming(false);
    }
  };

  const navigateAway = (href: string) => {
    if (dirty && !window.confirm('Há alterações não salvas na estrutura. Sair mesmo assim?')) {
      return;
    }
    router.push(href);
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

  const readyForConference = blocos.length > 0 || Boolean(imp?.estruturaDetectada?.blocos?.length);
  const waitingProcessing = imp?.status === 'processando';
  const failedProcessing = imp?.status === 'erro';

  const typeOptions = useMemo(
    () => EDITABLE_TYPES.map((t) => ({ value: t, label: UNIT_TYPE_LABELS[t] ?? t })),
    [],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AdminTopbar
        sticky
        title="Importação estruturada"
        actions={
          <Link href="/admin/importar">
            <Button variant="ghost" size="sm">
              Trocar fluxo
            </Button>
          </Link>
        }
      />

      <div className="min-h-0 flex-1 overflow-auto p-6">
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
            <p className="mt-1 text-[13px] text-ink-3">
              PDF digitalizado será processado com OCR automaticamente
            </p>
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
              <p className="mt-2 font-mono text-[12px] opacity-90">
                {imp.lib.replace(/^erro:\s*/, '')}
              </p>
            )}
          </div>
        )}

        {imp && imp.needsOcrReview && (
          <div className="mb-6 flex flex-col gap-3 rounded-[14px] border border-warn-bd bg-warn-bg px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[13px] text-warn">
              <strong>PDF digitalizado detectado.</strong> Revise o texto reconhecido por OCR antes
              da conferência.
            </div>
            <Link href={`/admin/ocr?importId=${imp.id}`}>
              <Button>Ir para revisão OCR →</Button>
            </Link>
          </div>
        )}

        {imp && !waitingProcessing && !failedProcessing && !imp.needsOcrReview && readyForConference && (
          <div className="mb-6 rounded-[14px] border border-ok-bd bg-ok-bg px-4 py-3 text-[13px] text-ok">
            Estrutura identificada — corrija textos e classificações ao lado do original e clique em{' '}
            <strong>Confirmar e salvar como rascunho</strong>.
            {dirty && (
              <span className="ml-2 font-semibold text-warn">Alterações ainda não salvas.</span>
            )}
          </div>
        )}

        {imp && (
          <>
            <div className="mb-4 inline-flex items-center gap-2 rounded-[10px] border border-line bg-surface px-3 py-2">
              <span className="font-mono text-[13px] text-ink">{imp.arquivoOriginal}</span>
              {imp.lib && <Badge variant="info">{imp.lib}</Badge>}
              {imp.formato === 'pdf_ocr' && <Badge variant="warn">OCR</Badge>}
            </div>

            <div className="mb-6 grid gap-4 rounded-[14px] border border-line bg-surface p-5 sm:grid-cols-2 lg:grid-cols-4">
              {imp.estruturaDetectada?.metadados?.tituloCompleto && (
                <p className="sm:col-span-2 lg:col-span-4 text-[12px] text-ink-3">
                  Título identificado:{' '}
                  <span className="font-semibold text-ink">
                    {imp.estruturaDetectada.metadados.tituloCompleto}
                  </span>
                </p>
              )}
              <div>
                <label className="mb-1 block text-[12px] text-ink-3">Tipo</label>
                <Select
                  value={meta.tipo}
                  onChange={(e) => {
                    setMeta({ ...meta, tipo: e.target.value });
                    setDirty(true);
                  }}
                >
                  {ACT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ACT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-[12px] text-ink-3">Número</label>
                <Input
                  value={meta.numero}
                  onChange={(e) => {
                    setMeta({ ...meta, numero: e.target.value });
                    setDirty(true);
                  }}
                  placeholder="Auto"
                  className="font-mono"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] text-ink-3">Data do ato</label>
                <Input
                  type="date"
                  value={meta.dataAto}
                  onChange={(e) => {
                    const dataAto = e.target.value;
                    setMeta({
                      ...meta,
                      dataAto,
                      ano: dataAto
                        ? String(new Date(dataAto).getUTCFullYear())
                        : meta.ano,
                    });
                    setDirty(true);
                  }}
                  className="font-mono"
                />
                <p className="mt-1 text-[11px] text-ink-4">
                  Ano {meta.dataAto ? new Date(meta.dataAto).getUTCFullYear() : meta.ano}{' '}
                  derivado automaticamente
                </p>
              </div>
              <div>
                <label className="mb-1 block text-[12px] text-ink-3">Ementa</label>
                <Input
                  value={meta.ementa}
                  onChange={(e) => {
                    setMeta({ ...meta, ementa: e.target.value });
                    setDirty(true);
                  }}
                />
              </div>
            </div>

            {/* Controles de tamanho da comparação (largura + altura) */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[12px] border border-line bg-surface px-3 py-2.5">
              <label className="flex items-center gap-2 text-[12px] text-ink-3">
                Largura do original
                <input
                  type="range"
                  min={28}
                  max={70}
                  value={splitPct}
                  onChange={(e) => setSplitPct(Number(e.target.value))}
                  className="w-36"
                  aria-valuetext={`${splitPct}%`}
                />
                <span className="w-8 tabular-nums text-ink-4">{splitPct}%</span>
              </label>
              <label className="flex items-center gap-2 text-[12px] text-ink-3">
                Altura dos quadros
                <input
                  type="range"
                  min={MIN_PANEL_HEIGHT}
                  max={MAX_PANEL_HEIGHT}
                  step={20}
                  value={panelHeight}
                  onChange={(e) => setPanelHeight(Number(e.target.value))}
                  className="w-36"
                  aria-valuetext={`${panelHeight}px`}
                />
                <span className="w-12 tabular-nums text-ink-4">{panelHeight}px</span>
              </label>
            </div>

            {/* Painéis lado a lado com altura controlada e scroll interno */}
            <div
              className="flex flex-col gap-4 lg:flex-row lg:items-stretch"
              style={{ ['--import-split' as string]: `${splitPct}%` }}
            >
              <section
                className="flex min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-[14px] border border-line bg-surface lg:w-[var(--import-split)] lg:flex-none"
                style={{ height: panelHeight, maxHeight: panelHeight }}
              >
                <div className="shrink-0 border-b border-line px-4 py-3">
                  <h2 className="text-section">Arquivo original</h2>
                </div>
                <div className="relative min-h-0 flex-1">
                  {imp.formato.includes('pdf') ? (
                    filePreviewUrl ? (
                      <iframe
                        src={filePreviewUrl}
                        className="absolute inset-0 h-full w-full border-0 bg-white"
                        title="Preview PDF"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-surface-2 text-[13px] text-ink-3">
                        Carregando preview...
                      </div>
                    )
                  ) : imp.formato === 'docx' ? (
                    docxPreviewHtml ? (
                      <iframe
                        srcDoc={docxPreviewHtml}
                        className="absolute inset-0 h-full w-full border-0 bg-surface"
                        title="Preview DOCX"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-surface-2 text-[13px] text-ink-3">
                        Carregando preview...
                      </div>
                    )
                  ) : (
                    <div className="flex h-full items-center justify-center bg-surface-2 text-[13px] text-ink-3">
                      Preview indisponível para este formato
                    </div>
                  )}
                </div>
              </section>

              <section
                className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-line bg-surface"
                style={{ height: panelHeight, maxHeight: panelHeight }}
              >
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-4 py-3">
                  <h2 className="text-section">Estrutura identificada</h2>
                  {dirty && (
                    <Button
                      size="sm"
                      variant="outlined"
                      onClick={persistStructure}
                      disabled={savingStructure}
                    >
                      {savingStructure ? 'Salvando...' : 'Salvar correções'}
                    </Button>
                  )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {blocos.length > 0 ? (
                    <ul className="space-y-2">
                      {blocos.map((item) => {
                        const editing = editingOrdem === item.ordem;
                        return (
                          <li
                            key={`${item.ordem}-${item.tag}`}
                            className={`rounded-[10px] border px-3 py-2 ${
                              item.confianca < 80
                                ? 'border-warn-bd bg-warn-bg'
                                : 'border-line-2 bg-surface-2'
                            }`}
                          >
                            {editing ? (
                              <div className="space-y-2">
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <div>
                                    <label className="mb-1 block text-[11px] text-ink-3">
                                      Tipo
                                    </label>
                                    <Select
                                      value={item.tipo}
                                      onChange={(e) =>
                                        updateBloco(item.ordem, { tipo: e.target.value })
                                      }
                                    >
                                      {typeOptions.map((t) => (
                                        <option key={t.value} value={t.value}>
                                          {t.label}
                                        </option>
                                      ))}
                                    </Select>
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-[11px] text-ink-3">
                                      Identificação
                                    </label>
                                    <Input
                                      className="font-mono"
                                      value={item.tag}
                                      onChange={(e) =>
                                        updateBloco(item.ordem, { tag: e.target.value })
                                      }
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="mb-1 block text-[11px] text-ink-3">Texto</label>
                                  <textarea
                                    value={item.texto}
                                    onChange={(e) =>
                                      updateBloco(item.ordem, { texto: e.target.value })
                                    }
                                    className="min-h-[88px] w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] focus-ring"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-[11px] text-ink-3">
                                    Vincular a (elemento pai)
                                  </label>
                                  <Select
                                    value={
                                      item.parentOrdem == null ? '' : String(item.parentOrdem)
                                    }
                                    onChange={(e) =>
                                      updateBloco(item.ordem, {
                                        parentOrdem:
                                          e.target.value === ''
                                            ? null
                                            : Number(e.target.value),
                                      })
                                    }
                                  >
                                    <option value="">Nenhum (nível superior)</option>
                                    {blocos
                                      .filter((b) => b.ordem !== item.ordem && b.ordem < item.ordem)
                                      .map((b) => (
                                        <option key={b.ordem} value={b.ordem}>
                                          [{b.ordem}] {b.tag} ({UNIT_TYPE_LABELS[b.tipo as UnitType] ?? b.tipo})
                                        </option>
                                      ))}
                                  </Select>
                                  <p className="mt-1 text-[10px] text-ink-4">
                                    Pode corrigir vínculos atípicos do documento original — o
                                    sistema não bloqueia estruturas fora do padrão.
                                  </p>
                                </div>
                                <div className="flex justify-end">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditingOrdem(null)}
                                  >
                                    Fechar
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-3">
                                <button
                                  type="button"
                                  className="min-w-0 flex-1 text-left"
                                  onClick={() => setEditingOrdem(item.ordem)}
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[13px] font-semibold text-ink">
                                      {item.tag}
                                    </span>
                                    <Badge variant="info" className="text-[10px]">
                                      {UNIT_TYPE_LABELS[item.tipo as UnitType] ?? item.tipo}
                                    </Badge>
                                    {item.parentOrdem != null && (
                                      <span className="text-[10px] text-ink-4">
                                        ↳ [{item.parentOrdem}]
                                      </span>
                                    )}
                                  </div>
                                  {item.texto && (
                                    <p className="mt-1 line-clamp-3 text-[12px] text-ink-3">
                                      {item.texto}
                                    </p>
                                  )}
                                </button>
                                <div className="flex shrink-0 flex-col items-end gap-1">
                                  <span className="font-mono text-[12px] text-ink-3">
                                    {item.confianca}%
                                  </span>
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline"
                                    onClick={() => setEditingOrdem(item.ordem)}
                                  >
                                    <Pencil className="h-3 w-3" />
                                    Editar
                                  </button>
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
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
                  <p className="mt-3 text-[12px] text-warn">
                    Clique em um elemento para corrigir tipo, identificação e texto antes de
                    confirmar.
                  </p>
                </div>
              </section>
            </div>

            {(imp.estruturaDetectada?.efeitosSugeridos?.length ?? 0) > 0 && (
              <div className="mt-6 rounded-[12px] border border-line bg-surface p-4">
                <h3 className="mb-2 text-[14px] font-semibold text-ink">
                  Efeitos legislativos sugeridos
                </h3>
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
                          </span>
                          <p className="mt-1 line-clamp-2 text-[12px] text-ink-3">{fx.trecho}</p>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
              {imp.actId ? (
                <Button variant="outlined" onClick={() => navigateAway(`/admin/atos/${imp.actId}/editor`)}>
                  Corrigir no editor
                </Button>
              ) : (
                <>
                  <Button variant="outlined" onClick={() => navigateAway('/admin/importar')}>
                    Novo upload
                  </Button>
                  {(failedProcessing ||
                    (!readyForConference && !waitingProcessing && !imp.needsOcrReview)) && (
                    <Button
                      variant="outlined"
                      onClick={handleReprocess}
                      disabled={reprocessing}
                    >
                      {reprocessing ? 'Reprocessando...' : 'Reprocessar arquivo'}
                    </Button>
                  )}
                  {dirty && (
                    <Button
                      variant="outlined"
                      onClick={persistStructure}
                      disabled={savingStructure}
                    >
                      {savingStructure ? 'Salvando...' : 'Salvar correções'}
                    </Button>
                  )}
                  <Button
                    onClick={handleConfirm}
                    disabled={
                      confirming || !readyForConference || imp.needsOcrReview || waitingProcessing
                    }
                  >
                    {confirming ? 'Salvando...' : 'Confirmar e salvar como rascunho'}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
