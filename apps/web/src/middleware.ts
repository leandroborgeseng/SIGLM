import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ACCESS = 'lm_access_token';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
  matcher: ['/admin/:path*'],
};
