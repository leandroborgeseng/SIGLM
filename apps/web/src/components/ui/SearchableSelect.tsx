'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/format';
import { Input } from '@/components/ui/Form';

export type SearchableSelectOption = {
  value: string;
  label: string;
  searchText?: string;
};

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Selecione…',
  allLabel,
  searchPlaceholder = 'Buscar…',
  className,
  id: idProp,
  disabled,
  'aria-label': ariaLabel,
}: {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string | null) => void;
  placeholder?: string;
  /** Rótulo da opção vazia (ex.: "Todos os órgãos"). */
  allLabel?: string;
  searchPlaceholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const hay = (o.searchText ?? o.label).toLowerCase();
      return hay.includes(q);
    });
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const display = selected?.label ?? (allLabel ? allLabel : placeholder);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-[38px] w-full items-center justify-between gap-2 rounded-[10px] border border-line bg-surface px-3.5 text-left text-[13.5px] focus-ring',
          !value && allLabel ? 'text-ink-4' : 'text-ink',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className="min-w-0 truncate">{display}</span>
        <span className="flex shrink-0 items-center gap-1">
          {value && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Limpar seleção"
              className="rounded p-0.5 text-ink-4 hover:bg-surface-2 hover:text-ink"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
                setQuery('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(null);
                  setQuery('');
                }
              }}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={cn('h-4 w-4 text-ink-4 transition', open && 'rotate-180')} />
        </span>
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 w-full overflow-hidden rounded-[10px] border border-line bg-surface shadow-lg"
        >
          <div className="border-b border-line-2 p-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 text-[13px]"
              autoFocus
              aria-label="Buscar opções"
            />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {allLabel && (
              <li role="option" aria-selected={!value}>
                <button
                  type="button"
                  className={cn(
                    'w-full px-3 py-2 text-left text-[13px] hover:bg-surface-2',
                    !value && 'bg-brand/5 font-medium text-brand',
                  )}
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  {allLabel}
                </button>
              </li>
            )}
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-[13px] text-ink-4">Nenhuma opção encontrada.</li>
            ) : (
              filtered.map((o) => (
                <li key={o.value} role="option" aria-selected={value === o.value}>
                  <button
                    type="button"
                    className={cn(
                      'w-full px-3 py-2 text-left text-[13px] hover:bg-surface-2',
                      value === o.value && 'bg-brand/5 font-medium text-brand',
                    )}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                      setQuery('');
                    }}
                  >
                    {o.label}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
