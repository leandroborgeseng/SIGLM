'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  ACCESS_TOKEN_COOKIE,
  clearAuthCookies,
  fetchMe,
  setAuthCookies,
  type AuthUser,
} from '@/lib/auth';
import {
  ensureFreshAccessToken,
  forceRefreshAccessToken,
  readAccessToken,
  readRefreshToken,
} from '@/lib/auth-session';
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
  refreshUser: () => Promise<void>;
  applySession: (accessToken: string, refreshToken: string, nextUser: AuthUser) => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

/** Renova o access token a cada 12 min enquanto houver uso ativo. */
const PROACTIVE_REFRESH_MS = 12 * 60 * 1000;

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const bootstrapped = useRef(false);

  // Bootstrap único — não reexecutar a cada navegação (evita logout falso durante edição).
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      let token = readCookie(ACCESS_TOKEN_COOKIE) ?? (await ensureFreshAccessToken());
      if (!token && readRefreshToken()) {
        token = await forceRefreshAccessToken();
      }
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const me = await fetchMe(token);
        if (!cancelled) setUser(me);
      } catch {
        const fresh = await forceRefreshAccessToken();
        if (fresh) {
          try {
            const me = await fetchMe(fresh);
            if (!cancelled) setUser(me);
            return;
          } catch {
            /* fall through */
          }
        }
        clearAuthCookies();
        const path = pathnameRef.current;
        if (!cancelled && path && !path.startsWith('/admin/login')) {
          router.push(`/admin/login?from=${encodeURIComponent(path)}&sessao=expirada`);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          bootstrapped.current = true;
        }
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- montagem única
  }, [router]);

  const refreshUser = async () => {
    const token = readCookie(ACCESS_TOKEN_COOKIE) ?? (await ensureFreshAccessToken());
    if (!token) return;
    try {
      const me = await fetchMe(token);
      setUser(me);
    } catch {
      /* ignore */
    }
  };

  const applySession = (accessToken: string, refreshToken: string, nextUser: AuthUser) => {
    setAuthCookies(accessToken, refreshToken);
    setUser(nextUser);
  };

  // Bloqueia rotas admin enquanto mustChangePassword estiver ativo.
  useEffect(() => {
    if (loading || !user?.mustChangePassword) return;
    const path = pathname ?? '';
    if (path.startsWith('/admin/login') || path.startsWith('/admin/alterar-senha')) return;
    const from = path || '/admin/atos';
    router.replace(`/admin/alterar-senha?from=${encodeURIComponent(from)}`);
  }, [loading, user?.mustChangePassword, pathname, router]);

  // Renovação preventiva enquanto a aba estiver aberta / em foco.
  useEffect(() => {
    if (!user && !bootstrapped.current) return;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      if (!readRefreshToken()) return;
      void forceRefreshAccessToken();
    };
    const id = window.setInterval(tick, PROACTIVE_REFRESH_MS);
    const onFocus = () => {
      void ensureFreshAccessToken();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [user]);

  const logout = () => {
    clearAuthCookies();
    setUser(null);
    router.push('/admin/login');
    router.refresh();
  };

  const can = (permission: AdminPermission) => hasPermission(user?.permissions, permission);

  return (
    <AdminAuthContext.Provider value={{ user, loading, can, logout, refreshUser, applySession }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth deve ser usado dentro de AdminAuthProvider');
  return ctx;
}

export function useAccessToken() {
  return readAccessToken();
}
