import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ACCESS = 'lm_access_token';
const STAGING = 'lm_staging';

function stagingGateActive(): boolean {
  return process.env.NEXT_PUBLIC_STAGING_GATE === 'true';
}

export function middleware(request: NextRequest) {
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

  if (!pathname.startsWith('/admin') || pathname.startsWith('/admin/login')) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ACCESS)?.value;
  if (!token) {
    const login = new URL('/admin/login', request.url);
    login.searchParams.set('from', pathname);
    if (request.cookies.get('lm_refresh_token')?.value) {
      login.searchParams.set('sessao', 'expirada');
    }
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand/).*)'],
};
