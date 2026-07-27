'use client';

import { useEffect, useState } from 'react';
import { FileSearch } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { identifiedTextOriginLabel, type IdentifiedTextOrigin } from '@/lib/identified-import-text';

export function IdentifiedImportTextDialog({
  open,
  onClose,
  title = 'Texto identificado na importação',
  filename,
  origem,
  texto,
  ausente,
  saving,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  filename?: string;
  origem?: IdentifiedTextOrigin | string | null;
  texto?: string | null;
  ausente?: boolean;
  saving?: boolean;
  onSave?: (text: string) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(texto ?? '');

  useEffect(() => {
    if (open) setDraft(texto ?? '');
  }, [open, texto]);

  if (!open) return null;

  const isOcr = origem === 'ocr';
  const canEdit = Boolean(onSave);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSave) return;
    await onSave(draft);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="identified-text-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-[14px] border border-line bg-surface shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <FileSearch className="h-5 w-5 shrink-0 text-brand" aria-hidden />
              <h2 id="identified-text-title" className="text-[16px] font-semibold text-ink">
                {title}
              </h2>
            </div>
            {filename && (
              <p className="truncate text-[12px] text-ink-4">Arquivo: {filename}</p>
            )}
            <p className="mt-1 text-[12px] text-ink-3">
              Método: {identifiedTextOriginLabel(origem)}
            </p>
            {isOcr && (
              <p className="mt-2 rounded-[8px] border border-warn/40 bg-warn/10 px-3 py-2 text-[12px] text-warn">
                Texto obtido por OCR — pode conter erros de reconhecimento. Revise antes de
                concluir a importação.
              </p>
            )}
            {ausente && !texto?.trim() && (
              <p className="mt-2 rounded-[8px] border border-danger/30 bg-danger/5 px-3 py-2 text-[12px] text-danger">
                Não foi possível extrair texto integral deste arquivo. A importação pode continuar,
                mas a busca pública ficará limitada até haver texto estruturado.
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto p-5">
            <textarea
              className="min-h-[320px] w-full rounded-[10px] border border-line bg-surface px-3 py-2 font-mono text-[13px] leading-relaxed text-ink"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              readOnly={!canEdit}
              placeholder={
                ausente
                  ? 'Nenhum texto identificado automaticamente.'
                  : 'Texto identificado na importação…'
              }
            />
          </div>
          {canEdit && (
            <div className="flex shrink-0 justify-end gap-2 border-t border-line px-5 py-4">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar alterações'}
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
