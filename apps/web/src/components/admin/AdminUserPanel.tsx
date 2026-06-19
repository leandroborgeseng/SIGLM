'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import {
  ACCESS_TOKEN_COOKIE,
  clearAuthCookies,
  fetchMe,
  type AuthUser,
} from '@/lib/auth';

function readCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function AdminUserPanel() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const token = readCookie(ACCESS_TOKEN_COOKIE);
    if (!token) return;
    fetchMe(token)
      .then(setUser)
      .catch(() => {
        clearAuthCookies();
        router.push('/admin/login');
      });
  }, [router]);

  const logout = () => {
    clearAuthCookies();
    router.push('/admin/login');
    router.refresh();
  };

  const initial = user?.nome?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <div className="border-t border-line p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">
          {initial}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink">
            {user?.nome ?? 'Carregando...'}
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
