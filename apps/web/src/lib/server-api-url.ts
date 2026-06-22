const FALLBACK = 'http://localhost:3001/api';
const DEFAULT_INTERNAL_PORT = process.env.API_INTERNAL_PORT ?? '3001';

/** Corrige URL malformada quando ${{backend.PORT}} vem vazio no Railway. */
function fixRailwayInternalUrl(url: string): string {
  let u = url.trim().replace(/\/$/, '');

  if (u.includes('.railway.internal') && u.startsWith('https://')) {
    u = u.replace(/^https:\/\//, 'http://');
  }

  // http://siglm.railway.internal:/api  — porta vazia após ":"
  u = u.replace(
    /\.railway\.internal:\//,
    `.railway.internal:${DEFAULT_INTERNAL_PORT}/`,
  );

  // http://siglm.railway.internal/api — sem porta
  if (
    u.includes('.railway.internal') &&
    !/\.railway\.internal:\d+/.test(u)
  ) {
    u = u.replace(
      /\.railway\.internal/,
      `.railway.internal:${DEFAULT_INTERNAL_PORT}`,
    );
  }

  return u;
}

/** URL da API para SSR e proxy — prefere rede privada (sem egress no Railway). */
export function getServerApiUrl(): string {
  const internal = process.env.API_INTERNAL_URL;
  if (internal) return fixRailwayInternalUrl(internal);

  const pub = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (pub) return pub.replace(/\/$/, '');

  return FALLBACK;
}
