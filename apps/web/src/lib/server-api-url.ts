const FALLBACK = 'http://localhost:3001/api';

function normalizeInternal(url: string): string {
  const trimmed = url.replace(/\/$/, '');
  if (trimmed.includes('.railway.internal') && trimmed.startsWith('https://')) {
    return trimmed.replace(/^https:\/\//, 'http://');
  }
  return trimmed;
}

/** URL da API para SSR e proxy — prefere rede privada (sem egress no Railway). */
export function getServerApiUrl(): string {
  const internal = process.env.API_INTERNAL_URL;
  if (internal) return normalizeInternal(internal);

  const pub = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (pub) return pub.replace(/\/$/, '');

  return FALLBACK;
}
