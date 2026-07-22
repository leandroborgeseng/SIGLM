'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link2, Search, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Form';
import { searchActs } from '@/lib/api';
import { actUrl } from '@/lib/format';
import { sanitizeHref } from '@/lib/rich-text';
import type { ActSummary } from '@/lib/types';

export function HyperlinkDialog({
  open,
  initialUrl = '',
  selectedText,
  onClose,
  onApply,
  onRemove,
}: {
  open: boolean;
  initialUrl?: string;
  selectedText: string;
  onClose: () => void;
  onApply: (url: string) => void;
  onRemove?: () => void;
}) {
  const [mode, setMode] = useState<'url' | 'search'>('url');
  const [url, setUrl] = useState(initialUrl);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ActSummary[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUrl(initialUrl);
    setMode(initialUrl ? 'url' : 'url');
    setQ('');
    setResults([]);
  }, [open, initialUrl]);

  useEffect(() => {
    if (!open || mode !== 'search' || q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      setSearching(true);
      searchActs({ q: q.trim(), page: 1 })
        .then((res) => setResults(res.items.slice(0, 8)))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, mode, open]);

  const canApply = useMemo(() => Boolean(sanitizeHref(url)), [url]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4">
      <div
        className="w-full max-w-md rounded-[14px] border border-line bg-surface p-5 shadow-lg"
        role="dialog"
        aria-labelledby="hyperlink-title"
      >
        <h3 id="hyperlink-title" className="mb-1 text-[16px] font-semibold text-ink">
          Hiperlink
        </h3>
        <p className="mb-4 text-[12.5px] text-ink-3">
          Trecho: <span className="font-medium text-ink-2">“{selectedText || '…'}”</span>
        </p>

        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => setMode('url')}
            className={`flex-1 rounded-[10px] border px-3 py-2 text-[12.5px] font-semibold ${
              mode === 'url' ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-3'
            }`}
          >
            URL
          </button>
          <button
            type="button"
            onClick={() => setMode('search')}
            className={`flex-1 rounded-[10px] border px-3 py-2 text-[12.5px] font-semibold ${
              mode === 'search' ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-3'
            }`}
          >
            Norma do SIGLM
          </button>
        </div>

        {mode === 'url' ? (
          <div>
            <label className="mb-1 block text-[12px] text-ink-3">Endereço de destino</label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://… ou /legislacao/…"
              className="font-mono text-[13px]"
            />
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-[12px] text-ink-3">Buscar ato normativo</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Número, ementa ou palavra-chave…"
                className="pl-9"
              />
            </div>
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto">
              {searching && (
                <li className="px-2 py-2 text-[12px] text-ink-4">Buscando…</li>
              )}
              {!searching && results.length === 0 && q.trim().length >= 2 && (
                <li className="px-2 py-2 text-[12px] text-ink-4">Nenhum ato encontrado</li>
              )}
              {results.map((act) => (
                <li key={act.id}>
                  <button
                    type="button"
                    className="w-full rounded-[8px] border border-line-2 px-3 py-2 text-left hover:border-brand/40"
                    onClick={() => {
                      const href = actUrl(act.slug);
                      setUrl(href);
                      onApply(href);
                      onClose();
                    }}
                  >
                    <p className="text-[12.5px] font-semibold text-brand">{act.codigo}</p>
                    <p className="line-clamp-2 text-[11.5px] text-ink-3">{act.ementa}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-between gap-2">
          <div>
            {onRemove && initialUrl && (
              <Button variant="ghost" size="sm" onClick={onRemove}>
                <Unlink className="h-3.5 w-3.5" />
                Remover link
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            {mode === 'url' && (
              <Button
                size="sm"
                disabled={!canApply || !selectedText}
                onClick={() => {
                  const href = sanitizeHref(url);
                  if (!href) return;
                  onApply(href);
                  onClose();
                }}
              >
                <Link2 className="h-3.5 w-3.5" />
                Aplicar
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
