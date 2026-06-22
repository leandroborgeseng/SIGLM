const FALLBACK = 'http://localhost:3001/api';
const PROXY = '/api/backend';

function isRailwayInternal(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('.railway.internal');
  } catch {
    return url.includes('.railway.internal');
  }
}

function getPublicApiUrl(): string | null {
  for (const url of [process.env.API_URL, process.env.NEXT_PUBLIC_API_URL]) {
    if (url && !isRailwayInternal(url)) return url;
  }
  return null;
}

/** URL base da API (com sufixo /api). */
export function getApiBaseUrl(): string {
  // Browser em produção: proxy same-origin (sem CORS, sem env no build)
  if (typeof window !== 'undefined') {
    if (process.env.NODE_ENV === 'production') return PROXY;
    return process.env.NEXT_PUBLIC_API_URL ?? FALLBACK;
  }

  // SSR: só URL pública em runtime — nunca .railway.internal
  return getPublicApiUrl() ?? FALLBACK;
}
