import { Suspense } from 'react';
import { ConsolidationPanel } from '@/components/admin/ConsolidationPanel';
import { ToastProvider } from '@/components/ui/Toast';

export default function ConsolidarPage() {
  return (
    <ToastProvider>
      <Suspense>
        <ConsolidationPanel />
      </Suspense>
    </ToastProvider>
  );
}
