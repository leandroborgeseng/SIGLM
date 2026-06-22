const FALLBACK = 'http://localhost:3001/api';
const DEFAULT_INTERNAL_PORT = process.env.API_INTERNAL_PORT ?? '3001';

/** Corrige URL malformada quando ${{backend.PORT}} vem vazio no Railway. */
function fixRailwayInternalUrl(url: string): string {
  let u = url.trim().replace(/\/$/, '');

  if (u.includes('.railway.internal') && u.startsWith('https://')) {
    u = u.replace(/^https:\/\//, 'http://');
  }

  u = u.replace(
    /\.railway\.internal:\//,
    `.railway.internal:${DEFAULT_INTERNAL_PORT}/`,
  );

  if (u.includes('.railway.internal') && !/\.railway\.internal:\d+/.test(u)) {
    u = u.replace(
      /\.railway\.internal/,
      `.railway.internal:${DEFAULT_INTERNAL_PORT}`,
    );
  }

  return u;
}

/** Candidatos para o proxy alcançar a API (interno primeiro, público como fallback). */
export function getUpstreamApiUrls(): string[] {
  const urls: string[] = [];

  if (process.env.API_INTERNAL_URL) {
    urls.push(fixRailwayInternalUrl(process.env.API_INTERNAL_URL));
  }
  if (process.env.API_URL) {
    urls.push(process.env.API_URL.replace(/\/$/, ''));
  }
  if (process.env.NEXT_PUBLIC_API_URL && !urls.includes(process.env.NEXT_PUBLIC_API_URL)) {
    urls.push(process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, ''));
  }

  return urls.length > 0 ? urls : [FALLBACK];
}

/** @deprecated Use getUpstreamApiUrls no proxy ou loopback no SSR. */
export function getServerApiUrl(): string {
  return getUpstreamApiUrls()[0];
}
