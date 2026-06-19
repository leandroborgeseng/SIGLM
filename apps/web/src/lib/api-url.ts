/** URL base da API (com sufixo /api). */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
  }
  // SSR: API_URL/NEXT_PUBLIC em runtime; API_INTERNAL só para Docker Compose (Coolify)
  return (
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_INTERNAL_URL ??
    'http://localhost:3001/api'
  );
}
