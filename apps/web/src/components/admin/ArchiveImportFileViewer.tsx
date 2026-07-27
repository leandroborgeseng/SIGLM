'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  getArchiveImportItemFileUrl,
  getArchiveImportItemPreviewHtml,
  type ArchiveImportItem,
} from '@/lib/admin-api';
import { cn } from '@/lib/format';
import {
  DEFAULT_COMPARE_PANEL_HEIGHT,
  MAX_COMPARE_PANEL_HEIGHT,
  MIN_COMPARE_PANEL_HEIGHT,
} from '@/components/admin/OriginalFileCompare';

export { DEFAULT_COMPARE_PANEL_HEIGHT, MIN_COMPARE_PANEL_HEIGHT, MAX_COMPARE_PANEL_HEIGHT };

function isPdf(name: string, formato: string) {
  return /\.pdf$/i.test(name) || formato.includes('pdf');
}

function isDocx(name: string, formato: string) {
  return /\.docx?$/i.test(name) || formato === 'docx';
}

export function ArchiveImportFileViewer({
  batchId,
  item,
  className,
  heightPx = DEFAULT_COMPARE_PANEL_HEIGHT,
  onClose,
}: {
  batchId: string;
  item: ArchiveImportItem;
  className?: string;
  heightPx?: number;
  onClose?: () => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const kind = useMemo(() => {
    if (isPdf(item.nomeArquivo, item.formato)) return 'pdf';
    if (isDocx(item.nomeArquivo, item.formato)) return 'docx';
    return 'other';
  }, [item.nomeArquivo, item.formato]);

  const load = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    setLoading(true);
    setError('');
    setPreviewUrl(null);
    setDocxHtml(null);

    const run = async () => {
      try {
        if (kind === 'docx') {
          const html = await getArchiveImportItemPreviewHtml(batchId, item.id);
          if (cancelled) return;
          setDocxHtml(html);
        } else {
          const url = await getArchiveImportItemFileUrl(batchId, item.id);
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          revoked = url;
          setPreviewUrl(url);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Falha ao carregar arquivo');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [batchId, item.id, kind, reloadToken]);

  const openExternal = () => {
    void getArchiveImportItemFileUrl(batchId, item.id)
      .then((url) => {
        window.open(url, '_blank', 'noopener,noreferrer');
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      })
      .catch(() => undefined);
  };

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-sm',
        className,
      )}
      style={{ height: heightPx, maxHeight: heightPx }}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-ink">Visualização do arquivo</p>
          <p className="truncate text-[11px] text-ink-4">{item.nomeArquivo}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {(previewUrl || docxHtml) && (
            <button
              type="button"
              className="text-[12px] font-medium text-brand hover:underline"
              onClick={openExternal}
            >
              Abrir / Baixar
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className="rounded p-1 text-ink-4 hover:bg-surface-2 hover:text-ink"
              onClick={onClose}
              aria-label="Fechar visualizador"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {loading && (
          <p className="absolute inset-0 p-4 text-[13px] text-ink-4">Carregando arquivo…</p>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-start justify-center gap-3 p-4">
            <p className="text-[13px] text-danger">{error}</p>
            <p className="text-[12px] text-ink-3">
              Não foi possível gerar a visualização embutida. Use Abrir ou Baixar para conferir o
              documento original.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outlined" onClick={load}>
                <RefreshCw className="h-3.5 w-3.5" />
                Tentar novamente
              </Button>
              <Button size="sm" variant="ghost" onClick={openExternal}>
                Abrir / Baixar
              </Button>
            </div>
          </div>
        )}
        {!loading && !error && previewUrl && (kind === 'pdf' || kind === 'other') && (
          <iframe
            title={`Arquivo ${item.nomeArquivo}`}
            src={previewUrl}
            className="absolute inset-0 h-full w-full border-0 bg-white"
          />
        )}
        {!loading && !error && docxHtml && kind === 'docx' && (
          <iframe
            title={`Preview ${item.nomeArquivo}`}
            srcDoc={docxHtml}
            className="absolute inset-0 h-full w-full border-0 bg-white"
            sandbox=""
          />
        )}
        {!loading && !error && !previewUrl && !docxHtml && kind === 'other' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-2 p-6 text-center">
            <FileText className="h-8 w-8 text-ink-4" />
            <p className="text-[13px] text-ink-2">
              Preview embutido indisponível para este formato.
            </p>
            <Button size="sm" variant="outlined" onClick={openExternal}>
              Abrir / Baixar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
