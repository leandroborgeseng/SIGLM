'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AdminTopbar } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import {
  approveOcr,
  fetchImportFileUrl,
  getImport,
  reprocessOcr,
  updateOcrPages,
  type ImportDetail,
} from '@/lib/admin-api';

export function OcrReviewPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Aceita id da rota Importar (?id=&revisaoOcr=1) ou o parâmetro legado importId.
  const importId = searchParams.get('id') ?? searchParams.get('importId');
  const { toast } = useToast();

  const [imp, setImp] = useState<ImportDetail | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [pages, setPages] = useState<{ pagina: number; texto: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (id: string) => {
    const data = await getImport(id);
    setImp(data);
    setPages(data.ocrResults.map((r) => ({ pagina: r.pagina, texto: r.texto })));
    return data;
  }, []);

  useEffect(() => {
    if (importId) load(importId).catch(() => toast('Importação não encontrada', 'danger'));
  }, [importId, load, toast]);

  useEffect(() => {
    if (!importId || !imp) return;
    const waiting =
      imp.status === 'processando' ||
      (imp.formato === 'pdf_ocr' && imp.ocrResults.length === 0 && imp.status !== 'erro');
    if (!waiting) return;
    const timer = setInterval(() => {
      load(importId).catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, [importId, imp, load]);

  useEffect(() => {
    if (!importId) {
      setFilePreviewUrl(null);
      return;
    }
    let url: string | null = null;
    fetchImportFileUrl(importId)
      .then((u) => {
        url = u;
        setFilePreviewUrl(u);
      })
      .catch(() => toast('Preview do PDF indisponível', 'warn'));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [importId, toast]);

  const savePages = async () => {
    if (!importId) return;
    await updateOcrPages(importId, pages);
  };

  const handleReprocess = async () => {
    if (!importId) return;
    setLoading(true);
    try {
      const data = await reprocessOcr(importId);
      setImp(data);
      setPages(data.ocrResults.map((r) => ({ pagina: r.pagina, texto: r.texto })));
      toast('Processando OCR em segundo plano...', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao reprocessar', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!importId) return;
    setLoading(true);
    try {
      await savePages();
      await approveOcr(importId);
      toast('OCR aprovado — prossiga para conferência', 'ok');
      router.push(`/admin/importar?id=${importId}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao aprovar', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const combinedText = pages.map((p) => p.texto).join('\n\n');
  const lowLines = imp?.lowConfidenceLines ?? [];

  return (
    <>
      <AdminTopbar
        title="Importar — revisão OCR"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              router.push(importId ? `/admin/importar?id=${importId}` : '/admin/importar')
            }
          >
            Voltar à conferência
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="mb-6 rounded-[10px] border border-warn-bd bg-warn-bg px-4 py-3 text-[13.5px] text-warn">
          <strong>Revisão humana obrigatória</strong> — textos reconhecidos por OCR devem ser
          revisados antes da publicação. O OCR é aplicado automaticamente na importação estruturada
          quando o PDF não possui texto pesquisável.
        </div>

        {!importId && (
          <p className="text-[14px] text-ink-3">
            Nenhuma importação selecionada. Faça upload de um PDF digitalizado em{' '}
            <a href="/admin/importar" className="text-brand hover:underline">
              Importar
            </a>
            .
          </p>
        )}

        {imp && imp.status === 'processando' && (
          <div className="mb-6 rounded-[14px] border border-brand-soft bg-brand-soft/40 px-4 py-3 text-[13px] text-brand">
            Processando OCR (pode levar alguns minutos). Esta página atualiza automaticamente.
          </div>
        )}

        {imp && imp.status === 'erro' && (
          <div className="mb-6 rounded-[14px] border border-danger-bd bg-danger-bg px-4 py-3 text-[13px] text-danger">
            <p>Falha no OCR. Tente reprocessar ou envie o arquivo novamente.</p>
            {imp.lib?.startsWith('erro:') && (
              <p className="mt-2 font-mono text-[12px] opacity-90">{imp.lib.replace(/^erro:\s*/, '')}</p>
            )}
          </div>
        )}

        {imp && (
          <>
            <div className="mb-4 font-mono text-[12px] text-ink-3">
              {imp.arquivoOriginal} · confiança média: {imp.mediaOcr ?? '—'}%
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-[14px] border border-line bg-surface p-5">
                <h2 className="text-section mb-4">PDF original (scan)</h2>
                {filePreviewUrl ? (
                  <iframe
                    src={filePreviewUrl}
                    className="h-80 w-full rounded-[10px] border border-line-2 bg-surface-2"
                    title="PDF scan"
                  />
                ) : (
                  <div className="flex h-80 items-center justify-center rounded-[10px] bg-surface-2 text-[13px] text-ink-3">
                    Carregando preview...
                  </div>
                )}
              </div>
              <div className="rounded-[14px] border border-line bg-surface p-5">
                <h2 className="text-section mb-4">Texto reconhecido (editável)</h2>
                <textarea
                  className="h-80 w-full rounded-[10px] border border-line p-3 font-mono text-[13px] leading-relaxed focus-ring"
                  value={pages.length === 1 ? pages[0].texto : combinedText}
                  onChange={(e) => {
                    if (pages.length === 1) {
                      setPages([{ pagina: 1, texto: e.target.value }]);
                    } else {
                      setPages([{ pagina: 1, texto: e.target.value }]);
                    }
                  }}
                />
                <p className="mt-2 font-mono text-[12px] text-ink-3">
                  Confiança média: {imp.mediaOcr ?? '—'}%
                </p>
              </div>
            </div>

            {lowLines.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-section">Trechos de baixa confiança</p>
                {lowLines.slice(0, 8).map((line, i) => (
                  <p key={i} className="rounded-[8px] bg-warn-bg px-3 py-2 text-[13px] text-ink-2">
                    &quot;{line.texto}&quot; — confiança {line.confianca}% (pág. {line.pagina})
                  </p>
                ))}
              </div>
            )}

            <div className="mt-6 flex gap-2">
              <Button variant="outlined" onClick={handleReprocess} disabled={loading || imp.status === 'processando'}>
                {imp.status === 'processando' ? 'Processando OCR...' : 'Reprocessar OCR'}
              </Button>
              <Button onClick={handleApprove} disabled={loading || imp.status === 'processando' || imp.ocrResults.length === 0}>
                {loading ? 'Salvando...' : 'Revisar e aprovar'}
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
