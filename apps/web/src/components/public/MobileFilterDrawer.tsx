'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FilterSidebar } from '@/components/public/FilterSidebar';
import type { FilterCounts } from '@/lib/types';

export function MobileFilterDrawer({ counts }: { counts: FilterCounts }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-4 lg:hidden">
      <Button
        variant="outlined"
        className="touch-target w-full"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="mobile-filters"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        Filtros
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-ink/40"
            aria-label="Fechar filtros"
            onClick={() => setOpen(false)}
          />
          <aside
            id="mobile-filters"
            role="dialog"
            aria-modal="true"
            aria-label="Filtros de busca"
            className="relative ml-auto flex h-full w-[min(100%,320px)] flex-col bg-surface shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-[15px] font-semibold text-ink">Filtros</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="touch-target inline-flex items-center justify-center rounded-[10px] text-ink-3 hover:bg-surface-2"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <FilterSidebar counts={counts} onChange={() => setOpen(false)} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
