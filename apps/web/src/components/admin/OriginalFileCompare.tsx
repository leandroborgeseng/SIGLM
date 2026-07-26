'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Columns2, FileText, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { fetchActAttachmentFileUrl } from '@/lib/admin-api';
import { cn } from '@/lib/format';
import type { ActAttachment } from '@/lib/types';

export const DEFAULT_COMPARE_PANEL_HEIGHT = 780;
export const MIN_COMPARE_PANEL_HEIGHT = 360;
export const MAX_COMPARE_PANEL_HEIGHT = 1400;

function isPdf(name: string) {
  return /\.pdf$/i.test(name) || name.toLowerCase().includes('pdf');
}

function isDocx(name: string) {
  return /\.docx?$/i.test(name);
}

/** Painel do arquivo original com rolagem própria (modo comparação). */
export function OriginalFilePane({
  actId,
  attachment,
  className,
  heightPx = DEFAULT_COMPARE_PANEL_HEIGHT,
}: {
  actId: string;
  attachment: ActAttachment;
  className?: string;
  /** Altura total do quadro (px), incluindo cabeçalho interno. */
  heightPx?: number;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const kind = useMemo(() => {
    if (isPdf(attachment.nome) || attachment.tipo.includes('pdf')) return 'pdf';
    if (isDocx(attachment.nome)) return 'docx';
    return 'other';
  }, [attachment.nome, attachment.tipo]);

  const load = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    setLoading(true);
    setError('');
    setPreviewUrl(null);
    fetchActAttachmentFileUrl(actId, attachment.id)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        revoked = url;
        setPreviewUrl(url);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Falha ao carregar arquivo');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [actId, attachment.id, reloadToken]);

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
          <p className="truncate text-[13px] font-semibold text-ink">Arquivo original</p>
          <p className="truncate text-[11px] text-ink-4">{attachment.nome}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] font-medium text-brand hover:underline"
            >
              Abrir em nova aba
            </a>
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
              O sistema tenta renovar o acesso automaticamente. Se o arquivo existir no
              armazenamento, use “Tentar novamente”. Só substitua se o documento realmente
              não estiver disponível.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outlined" onClick={load}>
                <RefreshCw className="h-3.5 w-3.5" />
                Tentar novamente
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void fetchActAttachmentFileUrl(actId, attachment.id)
                    .then((url) => window.open(url, '_blank', 'noopener,noreferrer'))
                    .catch(() => undefined);
                }}
              >
                Abrir em nova aba
              </Button>
            </div>
          </div>
        )}
        {!loading && !error && previewUrl && (kind === 'pdf' || kind === 'other') && (
          <iframe
            title="Arquivo original do ato"
            src={previewUrl}
            className="absolute inset-0 h-full w-full border-0 bg-white"
          />
        )}
        {!loading && !error && previewUrl && kind === 'docx' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface-2 p-6 text-center">
            <FileText className="h-8 w-8 text-ink-4" />
            <p className="text-[13px] text-ink-2">
              Preview embutido indisponível para este formato. Abra o arquivo em nova aba para
              conferência.
            </p>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] font-semibold text-brand hover:underline"
            >
              Baixar / abrir {attachment.nome}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function CompareModeToggle({
  active,
  hasOriginal,
  onToggle,
  onExit,
}: {
  active: boolean;
  hasOriginal: boolean;
  onToggle: () => void;
  onExit: () => void;
}) {
  if (active) {
    return (
      <Button variant="tonal" size="sm" onClick={onExit}>
        <X className="h-3.5 w-3.5" />
        Sair da comparação
      </Button>
    );
  }
  return (
    <Button
      variant="outlined"
      size="sm"
      onClick={onToggle}
      disabled={!hasOriginal}
      title={
        hasOriginal
          ? 'Comparar texto estruturado com o arquivo original'
          : 'Anexe o arquivo original nos Metadados para habilitar'
      }
    >
      <Columns2 className="h-3.5 w-3.5" />
      Comparar com arquivo original
    </Button>
  );
}
