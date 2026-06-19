'use client';

import { createContext, useCallback, useContext, useState } from 'react';

interface AdminMenuContextValue {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

const AdminMenuContext = createContext<AdminMenuContextValue | null>(null);

export function AdminMenuProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);

  return (
    <AdminMenuContext.Provider value={{ open, toggle, close }}>
      {children}
    </AdminMenuContext.Provider>
  );
}

export function useAdminMenu() {
  const ctx = useContext(AdminMenuContext);
  if (!ctx) throw new Error('useAdminMenu must be used within AdminMenuProvider');
  return ctx;
}
