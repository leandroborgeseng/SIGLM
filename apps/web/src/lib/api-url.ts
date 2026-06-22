const FALLBACK = 'http://localhost:3001/api';

function isRailwayInternal(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('.railway.internal');
  } catch {
    return url.includes('.railway.internal');
  }
}

/** Rede privada Railway só aceita HTTP, nunca HTTPS. */
function normalizeRailwayUrl(url: string): string {
  if (isRailwayInternal(url) && url.startsWith('https://')) {
    return url.replace(/^https:\/\//, 'http://');
  }
  return url;
}

function isPublicUrl(url: string): boolean {
  return !isRailwayInternal(url) && (url.startsWith('https://') || url.startsWith('http://'));
}

/** URL base da API (com sufixo /api). */
export function getApiBaseUrl(): string {
  // Browser: só URL pública — .railway.internal não é acessível no cliente
  if (typeof window !== 'undefined') {
    const pub = process.env.NEXT_PUBLIC_API_URL;
    if (pub && isPublicUrl(pub)) return pub;
    return FALLBACK;
  }

  // SSR: rede privada Railway (HTTP) → URL pública → fallback
  const internal = process.env.API_INTERNAL_URL;
  if (internal) return normalizeRailwayUrl(internal);

  const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl) {
    if (isRailwayInternal(apiUrl)) return normalizeRailwayUrl(apiUrl);
    if (isPublicUrl(apiUrl)) return apiUrl;
  }

  return FALLBACK;
}
