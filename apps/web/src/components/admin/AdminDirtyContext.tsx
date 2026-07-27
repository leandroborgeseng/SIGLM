'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface AdminDirtyContextValue {
  isDirty: boolean;
  dirtyMessage: string | null;
  markDirty: (message?: string) => void;
  clearDirty: () => void;
}

const AdminDirtyContext = createContext<AdminDirtyContextValue | null>(null);

export function AdminDirtyProvider({ children }: { children: ReactNode }) {
  const [dirtyMessage, setDirtyMessage] = useState<string | null>(null);

  const markDirty = useCallback((message?: string) => {
    setDirtyMessage(message ?? 'Há alterações não salvas nesta tela.');
  }, []);

  const clearDirty = useCallback(() => {
    setDirtyMessage(null);
  }, []);

  const value = useMemo(
    () => ({
      isDirty: dirtyMessage !== null,
      dirtyMessage,
      markDirty,
      clearDirty,
    }),
    [dirtyMessage, markDirty, clearDirty],
  );

  return (
    <AdminDirtyContext.Provider value={value}>{children}</AdminDirtyContext.Provider>
  );
}

export function useAdminDirty() {
  const ctx = useContext(AdminDirtyContext);
  if (!ctx) {
    return {
      isDirty: false,
      dirtyMessage: null,
      markDirty: () => {},
      clearDirty: () => {},
    };
  }
  return ctx;
}
