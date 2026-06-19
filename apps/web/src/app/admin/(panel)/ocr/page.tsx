import { Suspense } from 'react';
import { OcrReviewPanel } from '@/components/admin/OcrReviewPanel';
import { ToastProvider } from '@/components/ui/Toast';

export default function OcrPage() {
  return (
    <ToastProvider>
      <Suspense>
        <OcrReviewPanel />
      </Suspense>
    </ToastProvider>
  );
}
