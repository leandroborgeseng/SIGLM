import { Suspense } from 'react';
import { ImportPanel } from '@/components/admin/ImportPanel';
import { ToastProvider } from '@/components/ui/Toast';

export default function ImportarPage() {
  return (
    <ToastProvider>
      <Suspense>
        <ImportPanel />
      </Suspense>
    </ToastProvider>
  );
}
