/** URL base da API (com sufixo /api). */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
  }
  // SSR: API_URL é lida em runtime (Railway) — não exige rebuild ao mudar
  return (
    process.env.API_URL ??
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:3001/api'
  );
}
