'use client';

import { useEffect, useMemo, useState } from 'react';
import { Columns2, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { fetchActAttachmentFileUrl } from '@/lib/admin-api';
import { cn } from '@/lib/format';
import type { ActAttachment } from '@/lib/types';

const PANEL_HEIGHT = 'min(72vh, 900px)';

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
}: {
  actId: string;
  attachment: ActAttachment;
  className?: string;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const kind = useMemo(() => {
    if (isPdf(attachment.nome) || attachment.tipo.includes('pdf')) return 'pdf';
    if (isDocx(attachment.nome)) return 'docx';
    return 'other';
  }, [attachment.nome, attachment.tipo]);

  useEffect(() => {
    let revoked: string | null = null;
    setLoading(true);
    setError('');
    setPreviewUrl(null);
    fetchActAttachmentFileUrl(actId, attachment.id)
      .then((url) => {
        revoked = url;
        setPreviewUrl(url);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar arquivo'))
      .finally(() => setLoading(false));
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [actId, attachment.id]);

  return (
    <div className={cn('flex min-h-0 flex-col rounded-[14px] border border-line bg-surface shadow-sm', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-ink">Arquivo original</p>
          <p className="truncate text-[11px] text-ink-4">{attachment.nome}</p>
        </div>
        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[12px] font-medium text-brand hover:underline"
          >
            Abrir em nova aba
          </a>
        )}
      </div>
      <div className="min-h-0 flex-1 p-2" style={{ height: PANEL_HEIGHT }}>
        {loading && (
          <p className="p-4 text-[13px] text-ink-4">Carregando arquivo…</p>
        )}
        {error && !loading && (
          <p className="p-4 text-[13px] text-danger">{error}</p>
        )}
        {!loading && !error && previewUrl && (kind === 'pdf' || kind === 'other') && (
          <iframe
            title="Arquivo original do ato"
            src={previewUrl}
            className="h-full w-full rounded-[8px] border border-line-2 bg-white"
          />
        )}
        {!loading && !error && previewUrl && kind === 'docx' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-[8px] border border-dashed border-line-2 bg-surface-2 p-6 text-center">
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
