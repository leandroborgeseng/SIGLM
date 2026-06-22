'use client';

import { LogOut } from 'lucide-react';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';

export function AdminUserPanel() {
  const { user, loading, logout } = useAdminAuth();
  const initial = user?.nome?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <div className="border-t border-line p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">
          {initial}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink">
            {loading ? 'Carregando...' : (user?.nome ?? '—')}
          </p>
          <p className="truncate text-[11px] text-ink-3">{user?.email ?? ''}</p>
        </div>
      </div>
      {user?.role && (
        <p className="mb-2 truncate text-[11px] font-medium uppercase tracking-wide text-ink-4">
          {user.role.replace('_', ' ')}
        </p>
      )}
      <button
        type="button"
        onClick={logout}
        className="flex items-center gap-2 text-[12.5px] text-ink-3 hover:text-danger"
      >
        <LogOut className="h-3.5 w-3.5" />
        Sair
      </button>
    </div>
  );
}
