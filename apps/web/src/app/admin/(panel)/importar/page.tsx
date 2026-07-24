'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArchiveImportPanel } from '@/components/admin/ArchiveImportPanel';
import { ImportModeChooser } from '@/components/admin/ImportModeChooser';
import { ImportPanel } from '@/components/admin/ImportPanel';
import { ToastProvider } from '@/components/ui/Toast';

function ImportRouter() {
  const sp = useSearchParams();
  const batch = sp.get('batch');
  const id = sp.get('id');
  const modo = sp.get('modo');

  if (batch || modo === 'acervo') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ArchiveImportPanel />
      </div>
    );
  }

  if (id || modo === 'estruturada') {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ImportPanel />
      </div>
    );
  }

  return <ImportModeChooser />;
}

export default function ImportarPage() {
  return (
    <ToastProvider>
      <Suspense
        fallback={<div className="p-6 text-[13px] text-ink-3">Carregando importação…</div>}
      >
        <ImportRouter />
      </Suspense>
    </ToastProvider>
  );
}
