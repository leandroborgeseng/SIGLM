import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ACCESS = 'lm_access_token';
const REFRESH = 'lm_refresh_token';
const STAGING = 'lm_staging';

function stagingGateActive(): boolean {
  return process.env.NEXT_PUBLIC_STAGING_GATE === 'true';
}

/** Base da API com sufixo /api (mesma convenção de getApiBaseUrl). */
function apiBaseUrl(): string {
  const raw =
    process.env.API_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:3001/api';
  return raw.replace(/\/$/, '');
}

async function refreshAccess(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  try {
    const res = await fetch(`${apiBaseUrl()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as { accessToken: string; refreshToken: string };
  } catch {
    return null;
  }
}

function applyAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
  request: NextRequest,
) {
  const secure = request.nextUrl.protocol === 'https:';
  response.cookies.set(ACCESS, accessToken, {
    path: '/',
    maxAge: 900,
    sameSite: 'lax',
    secure,
  });
  response.cookies.set(REFRESH, refreshToken, {
    path: '/',
    maxAge: 604800,
    sameSite: 'lax',
    secure,
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (stagingGateActive()) {
    const isStagingRoute = pathname === '/acesso' || pathname.startsWith('/acesso/');
    const hasStagingCookie = Boolean(request.cookies.get(STAGING)?.value);
    if (!hasStagingCookie && !isStagingRoute) {
      const acesso = new URL('/acesso', request.url);
      acesso.searchParams.set('from', pathname);
      return NextResponse.redirect(acesso);
    }
  }

  if (!pathname.startsWith('/admin') || pathname.startsWith('/admin/login') || pathname.startsWith('/admin/alterar-senha')) {
    return NextResponse.next();
  }

  const access = request.cookies.get(ACCESS)?.value;
  const refresh = request.cookies.get(REFRESH)?.value;

  if (access) {
    return NextResponse.next();
  }

  if (refresh) {
    const tokens = await refreshAccess(refresh);
    if (tokens) {
      const response = NextResponse.next();
      applyAuthCookies(response, tokens.accessToken, tokens.refreshToken, request);
      return response;
    }
    const login = new URL('/admin/login', request.url);
    login.searchParams.set('from', pathname);
    login.searchParams.set('sessao', 'expirada');
    const response = NextResponse.redirect(login);
    response.cookies.set(ACCESS, '', { path: '/', maxAge: 0 });
    response.cookies.set(REFRESH, '', { path: '/', maxAge: 0 });
    return response;
  }

  const login = new URL('/admin/login', request.url);
  login.searchParams.set('from', pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand/).*)'],
};
