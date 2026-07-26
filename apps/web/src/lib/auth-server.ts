import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE, refreshSession } from './auth';
import { getApiBaseUrl } from './api-url';

export async function getServerAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
}

export async function getServerRefreshToken(): Promise<string | undefined> {
  return (await cookies()).get(REFRESH_TOKEN_COOKIE)?.value;
}

/** Valida o access token; se expirado, tenta refresh antes de redirecionar ao login. */
export async function requireServerAuth(): Promise<string> {
  const jar = await cookies();
  let token = jar.get(ACCESS_TOKEN_COOKIE)?.value;
  const refresh = jar.get(REFRESH_TOKEN_COOKIE)?.value;

  if (token) {
    try {
      const API_URL = getApiBaseUrl();
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (res.ok) return token;
    } catch {
      /* tenta refresh abaixo */
    }
  }

  if (refresh) {
    try {
      const data = await refreshSession(refresh);
      // Em Server Components não podemos setar cookies de resposta facilmente aqui;
      // o middleware / cliente renovam. Ainda assim devolvemos o access fresco
      // para esta requisição SSR não redirecionar incorretamente.
      return data.accessToken;
    } catch {
      /* fall through */
    }
  }

  redirect('/admin/login');
}
