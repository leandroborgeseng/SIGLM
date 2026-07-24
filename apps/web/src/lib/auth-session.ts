/**
 * Renovação transparente da sessão admin (access + refresh cookies).
 */

import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  refreshSession,
  setAuthCookies,
  clearAuthCookies,
} from '@/lib/auth';

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function readAccessToken(): string | undefined {
  return readCookie(ACCESS_TOKEN_COOKIE);
}

export function readRefreshToken(): string | undefined {
  return readCookie(REFRESH_TOKEN_COOKIE);
}

let refreshInFlight: Promise<string | null> | null = null;

/** Renova o access token se houver refresh válido. Deduplica chamadas paralelas. */
export async function ensureFreshAccessToken(): Promise<string | null> {
  const current = readAccessToken();
  if (current) return current;

  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const rt = readRefreshToken();
    if (!rt) return null;
    try {
      const data = await refreshSession(rt);
      setAuthCookies(data.accessToken, data.refreshToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/** Força renovação mesmo com access ainda presente (uso preventivo). */
export async function forceRefreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const rt = readRefreshToken();
    if (!rt) return null;
    try {
      const data = await refreshSession(rt);
      setAuthCookies(data.accessToken, data.refreshToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function authorizedFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  let token = readAccessToken() ?? (await ensureFreshAccessToken());
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res = await fetch(url, { ...init, headers, cache: 'no-store' });

  if (res.status === 401) {
    token = await forceRefreshAccessToken();
    if (token) {
      const retryHeaders = new Headers(init?.headers);
      retryHeaders.set('Authorization', `Bearer ${token}`);
      res = await fetch(url, { ...init, headers: retryHeaders, cache: 'no-store' });
    }
  }

  return res;
}

export function clearSession() {
  clearAuthCookies();
}
