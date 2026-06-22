import { NextRequest, NextResponse } from 'next/server';
import { getUpstreamApiUrls } from '@/lib/server-api-url';

async function proxy(req: NextRequest, path: string[]) {
  const suffix = `${path.join('/')}${req.nextUrl.search}`;

  const headers = new Headers();
  const auth = req.headers.get('authorization');
  if (auth) headers.set('authorization', auth);
  const contentType = req.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: 'no-store',
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer();
  }

  const candidates = getUpstreamApiUrls();
  let lastError: unknown;

  for (const base of candidates) {
    const upstream = `${base}/${suffix}`;
    try {
      const res = await fetch(upstream, init);
      const outHeaders = new Headers();
      const ct = res.headers.get('content-type');
      if (ct) outHeaders.set('content-type', ct);
      const cd = res.headers.get('content-disposition');
      if (cd) outHeaders.set('content-disposition', cd);
      return new NextResponse(res.body, { status: res.status, headers: outHeaders });
    } catch (err) {
      lastError = err;
      console.warn(`[proxy] falhou ${upstream}:`, err);
    }
  }

  return NextResponse.json(
    {
      message: `API indisponível. Tentou: ${candidates.join(', ')}`,
      error: lastError instanceof Error ? lastError.message : 'fetch failed',
    },
    { status: 502 },
  );
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
