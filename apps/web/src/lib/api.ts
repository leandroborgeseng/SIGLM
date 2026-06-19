import type {
  ActDetail,
  AdminListResponse,
  FilterCounts,
  SearchResponse,
} from './types';
import { getApiBaseUrl } from './api-url';

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const API_URL = getApiBaseUrl();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      cache: 'no-store',
    });
  } catch {
    throw new Error(
      `Não foi possível conectar à API (${API_URL}). Verifique se o backend está rodando: npm run dev:api`,
    );
  }
  if (res.status === 401) throw new AuthError('Não autenticado');
  if (res.status === 403) throw new AuthError('Permissão insuficiente');
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function searchActs(params: {
  q?: string;
  tipo?: string;
  situacao?: string;
  ano?: string;
  page?: number;
}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.tipo) qs.set('tipo', params.tipo);
  if (params.situacao) qs.set('situacao', params.situacao);
  if (params.ano) qs.set('ano', params.ano);
  if (params.page) qs.set('page', String(params.page));
  return fetchApi<SearchResponse>(`/public/acts?${qs}`);
}

export function getFilterCounts() {
  return fetchApi<FilterCounts>('/public/acts/filters');
}

export function getActBySlug(tipo: string, ano: string, numero: string) {
  return fetchApi<ActDetail>(`/public/acts/${tipo}/${ano}/${numero}`);
}

export function getAdminActs(
  params?: { q?: string; situacao?: string; page?: number },
  token?: string,
) {
  const qs = new URLSearchParams();
  if (params?.q) qs.set('q', params.q);
  if (params?.situacao) qs.set('situacao', params.situacao);
  if (params?.page) qs.set('page', String(params.page));
  return fetchApi<AdminListResponse>(`/admin/acts?${qs}`, {
    headers: authHeaders(token),
  });
}

export function getAdminAct(id: string, token?: string) {
  return fetchApi<ActDetail>(`/admin/acts/${id}`, {
    headers: authHeaders(token),
  });
}
