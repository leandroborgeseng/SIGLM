'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ACCESS_TOKEN_COOKIE,
  clearAuthCookies,
  fetchMe,
  type AuthUser,
} from '@/lib/auth';
import { hasPermission, type AdminPermission } from '@/lib/permissions';

function readCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

interface AdminAuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  can: (permission: AdminPermission) => boolean;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = readCookie(ACCESS_TOKEN_COOKIE);
    if (!token) {
      setLoading(false);
      return;
    }
    fetchMe(token)
      .then(setUser)
      .catch(() => {
        clearAuthCookies();
        router.push('/admin/login');
      })
      .finally(() => setLoading(false));
  }, [router]);

  const logout = () => {
    clearAuthCookies();
    setUser(null);
    router.push('/admin/login');
    router.refresh();
  };

  const can = (permission: AdminPermission) => hasPermission(user?.permissions, permission);

  return (
    <AdminAuthContext.Provider value={{ user, loading, can, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth deve ser usado dentro de AdminAuthProvider');
  return ctx;
}
