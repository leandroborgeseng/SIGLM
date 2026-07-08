import { getApiBaseUrl } from './api-url';

export const ACCESS_TOKEN_COOKIE = 'lm_access_token';
export const REFRESH_TOKEN_COOKIE = 'lm_refresh_token';

export interface AuthUser {
  id: string;
  nome: string;
  email: string;
  role: string;
  permissions: string[];
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

export function setAuthCookies(accessToken: string, refreshToken: string) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${ACCESS_TOKEN_COOKIE}=${accessToken}; path=/; max-age=900; SameSite=Lax${secure}`;
  document.cookie = `${REFRESH_TOKEN_COOKIE}=${refreshToken}; path=/; max-age=604800; SameSite=Lax${secure}`;
}

export function clearAuthCookies() {
  document.cookie = `${ACCESS_TOKEN_COOKIE}=; path=/; max-age=0`;
  document.cookie = `${REFRESH_TOKEN_COOKIE}=; path=/; max-age=0`;
}

export async function login(email: string, senha: string): Promise<LoginResponse> {
  const res = await fetch(`${getApiBaseUrl()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha }),
  });
  if (!res.ok) {
    if (res.status === 502) {
      throw new Error(
        'API indisponível. Verifique no Coolify se o serviço api está saudável e se as variáveis POSTGRES_PASSWORD e JWT_* estão definidas.',
      );
    }
    const err = await res.json().catch(() => ({}));
    const msg = Array.isArray(err.message) ? err.message[0] : err.message;
    throw new Error(msg ?? 'E-mail ou senha incorretos');
  }
  return res.json();
}

export async function fetchMe(token: string): Promise<AuthUser> {
  const res = await fetch(`${getApiBaseUrl()}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Sessão expirada');
  return res.json();
}

export async function refreshSession(refreshToken: string): Promise<LoginResponse> {
  const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) throw new Error('Sessão expirada');
  return res.json();
}
