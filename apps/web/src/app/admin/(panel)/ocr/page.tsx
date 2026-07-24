'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/** Rota legada: OCR ocorre nos fluxos de Importar — redireciona com segurança. */
function OcrLegacyRedirect() {
  const router = useRouter();
  const sp = useSearchParams();

  useEffect(() => {
    const importId = sp.get('importId') ?? sp.get('id');
    if (importId) {
      router.replace(`/admin/importar?id=${encodeURIComponent(importId)}&revisaoOcr=1`);
      return;
    }
    router.replace('/admin/importar');
  }, [router, sp]);

  return (
    <div className="flex flex-1 items-center justify-center p-6 text-[13px] text-ink-3">
      Redirecionando para Importar…
    </div>
  );
}

export default function OcrPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-6 text-[13px] text-ink-3">
          Redirecionando…
        </div>
      }
    >
      <OcrLegacyRedirect />
    </Suspense>
  );
}
