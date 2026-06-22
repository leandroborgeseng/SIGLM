import { getServerApiUrl } from './server-api-url';

const FALLBACK = 'http://localhost:3001/api';
const PROXY = '/api/backend';

function getSsrApiBaseUrl(): string {
  // SSR em produção: chama o próprio proxy (evita DNS interno direto no servidor)
  if (process.env.NODE_ENV === 'production') {
    const port = process.env.PORT ?? '3000';
    return `http://127.0.0.1:${port}${PROXY}`;
  }
  return getServerApiUrl();
}

/** URL base da API (com sufixo /api). */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    if (process.env.NODE_ENV === 'production') return PROXY;
    return process.env.NEXT_PUBLIC_API_URL ?? FALLBACK;
  }

  return getSsrApiBaseUrl();
}
