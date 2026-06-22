'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
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
  uploadImport,
  type ImportDetail,
} from '@/lib/admin-api';
import { ACT_TYPE_LABELS, ACT_TYPES } from '@/lib/format';

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
  const [meta, setMeta] = useState({ tipo: 'lei', numero: '', ano: String(new Date().getFullYear()), ementa: '' });

  const load = useCallback(async (id: string) => {
    const data = await getImport(id);
    setImp(data);
    if (data.needsOcrReview) {
      router.push(`/admin/ocr?importId=${id}`);
      return;
    }
    const ementaBlock = data.estruturaDetectada?.blocos.find((b) => b.tipo === 'ementa');
    if (ementaBlock) setMeta((m) => ({ ...m, ementa: ementaBlock.texto }));
  }, [router]);

  useEffect(() => {
    if (importId) load(importId).catch(() => toast('Importação não encontrada', 'danger'));
  }, [importId, load, toast]);

  useEffect(() => {
    if (!importId || !imp || imp.status !== 'processando') return;
    const timer = setInterval(() => {
      load(importId).catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, [importId, imp?.status, load]);

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
      } else {
        toast('Arquivo processado — confira a estrutura', 'ok');
        router.push(`/admin/importar?id=${data.id}`);
        setImp(data);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro no upload', 'danger');
    } finally {
      setUploading(false);
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
      : imp.status === 'conferencia'
        ? 1
        : imp.status === 'rascunho'
          ? 2
          : 0;

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

        {imp && imp.status === 'processando' && (
          <div className="mb-6 rounded-[14px] border border-brand-soft bg-brand-soft/40 px-4 py-3 text-[13px] text-brand">
            Processando arquivo (extração/OCR). Esta página atualiza automaticamente.
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
                        className={`flex items-center justify-between rounded-[10px] border px-3 py-2 ${
                          item.confianca < 80 ? 'border-warn-bd bg-warn-bg' : 'border-line-2 bg-surface-2'
                        }`}
                      >
                        <span className="font-mono text-[13px]">{item.tag}</span>
                        <span className="font-mono text-[12px] text-ink-3">{item.confianca}%</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-ink-3">Aguardando processamento ou revisão OCR</p>
                )}
                <p className="mt-3 text-[12px] text-warn">Revise manualmente trechos com confiança &lt; 80%</p>
              </div>
            </div>

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
                  <Button onClick={handleConfirm} disabled={confirming || !imp.estruturaDetectada}>
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
