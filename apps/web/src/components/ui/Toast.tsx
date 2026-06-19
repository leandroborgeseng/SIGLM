'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { cn } from '@/lib/format';

type ToastVariant = 'ok' | 'warn' | 'danger' | 'neutral';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

const ToastContext = createContext<{
  toast: (message: string, variant?: ToastVariant) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, variant: ToastVariant = 'neutral') => {
    const id = Date.now();
    setItems((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 2600);
  }, []);

  const styles: Record<ToastVariant, string> = {
    ok: 'bg-ok text-white',
    warn: 'bg-warn text-white',
    danger: 'bg-danger text-white',
    neutral: 'bg-ink text-white',
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'animate-in fade-in slide-in-from-bottom-2 rounded-[10px] px-4 py-2.5 text-[13.5px] font-medium shadow-lg',
              styles[t.variant],
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
