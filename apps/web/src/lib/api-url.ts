import { getServerApiUrl } from './server-api-url';

const FALLBACK = 'http://localhost:3001/api';
const PROXY = '/api/backend';

/** URL base da API (com sufixo /api). */
export function getApiBaseUrl(): string {
  // Browser em produção: proxy same-origin (sem CORS, sem egress)
  if (typeof window !== 'undefined') {
    if (process.env.NODE_ENV === 'production') return PROXY;
    return process.env.NEXT_PUBLIC_API_URL ?? FALLBACK;
  }

  // SSR: rede privada Railway ou fallback local
  return getServerApiUrl();
}
