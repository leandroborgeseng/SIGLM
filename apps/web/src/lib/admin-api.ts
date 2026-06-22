import type { ActDetail, AdminListResponse } from './types';
import { AuthError } from './api';
import { getApiBaseUrl } from './api-url';

function readClientToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(/(?:^|; )lm_access_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

async function adminFetch<T>(
  path: string,
  init?: RequestInit,
  token?: string,
): Promise<T> {
  const API_URL = getApiBaseUrl();
  const authToken = token ?? readClientToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...init?.headers,
      },
      cache: 'no-store',
    });
  } catch {
    throw new Error('Não foi possível conectar à API');
  }
  if (res.status === 401) throw new AuthError('Não autenticado');
  if (res.status === 403) throw new AuthError('Permissão insuficiente');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = Array.isArray(err.message) ? err.message.join(', ') : err.message;
    throw new Error(msg ?? `Erro ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface CreateActPayload {
  tipo: string;
  numero: number;
  ano: number;
  ementa: string;
  assunto?: string;
  orgaoOrigem?: string;
}

export interface UnitPayload {
  id?: string;
  tipoUnidade: string;
  identificacao?: string | null;
  texto: string;
  ordem: number;
}

export function createAct(payload: CreateActPayload, token?: string) {
  return adminFetch<ActDetail>('/admin/acts', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, token);
}

export function updateAct(id: string, payload: Record<string, unknown>, token?: string) {
  return adminFetch<ActDetail>(`/admin/acts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, token);
}

export function saveUnits(id: string, units: UnitPayload[], token?: string) {
  return adminFetch<ActDetail>(`/admin/acts/${id}/units`, {
    method: 'PUT',
    body: JSON.stringify({ units }),
  }, token);
}

export function addUnit(
  id: string,
  payload: { tipoUnidade: string; identificacao?: string; texto?: string },
  token?: string,
) {
  return adminFetch<ActDetail>(`/admin/acts/${id}/units`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, token);
}

export function submitForReview(id: string, token?: string) {
  return adminFetch<ActDetail>(`/admin/acts/${id}/submit-review`, { method: 'POST' }, token);
}

export function publishAct(id: string, token?: string) {
  return adminFetch<ActDetail>(`/admin/acts/${id}/publish`, { method: 'POST' }, token);
}

export function restoreUnitVersion(actId: string, unitId: string, versionId: string, token?: string) {
  return adminFetch<ActDetail>(
    `/admin/acts/${actId}/units/${unitId}/restore/${versionId}`,
    { method: 'POST' },
    token,
  );
}

export async function fetchDocxPreviewHtml(importId: string, token?: string): Promise<string> {
  const API_URL = getApiBaseUrl();
  const authToken = token ?? readClientToken();
  const res = await fetch(`${API_URL}/admin/imports/${importId}/preview-html`, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Preview DOCX indisponível');
  return res.text();
}

export interface ConsolidationAct {
  id: string;
  codigo: string;
  ementa: string;
  slug: string;
}

export interface ConsolidationUnit {
  id: string;
  identificacao: string | null;
  tipoUnidade: string;
  texto: string;
  status: string;
  ordem: number;
}

export interface ConsolidationPreview {
  normaAlteradora: { id: string; codigo: string };
  normaAlterada: { id: string; codigo: string };
  dispositivo: string | null;
  tipoAlteracao: string;
  textoAnterior: string | null;
  textoNovo: string | null;
  notaGerada: string;
  data: string;
}

export function listConsolidationActs(token?: string) {
  return adminFetch<ConsolidationAct[]>('/admin/consolidation/acts', undefined, token);
}

export function listConsolidationUnits(actId: string, token?: string) {
  return adminFetch<ConsolidationUnit[]>(`/admin/consolidation/acts/${actId}/units`, undefined, token);
}

export function previewConsolidation(payload: Record<string, unknown>, token?: string) {
  return adminFetch<ConsolidationPreview>('/admin/consolidation/preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, token);
}

export function applyConsolidation(payload: Record<string, unknown>, token?: string) {
  return adminFetch<ConsolidationPreview & { success?: boolean }>('/admin/consolidation/apply', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, token);
}

export interface ImportDetail {
  id: string;
  arquivo: string;
  arquivoOriginal: string;
  formato: string;
  lib: string | null;
  status: string;
  estruturaDetectada: {
    blocos: { tag: string; tipo: string; texto: string; confianca: number; ordem: number }[];
    mediaConfianca: number;
    ocrAprovado?: boolean;
  } | null;
  actId: string | null;
  ocrResults: {
    id: string;
    pagina: number;
    texto: string;
    confianca: { linhas: { texto: string; confianca: number }[]; mediaPagina: number };
    revisado: boolean;
  }[];
  ocrApproved: boolean;
  needsOcrReview: boolean;
  mediaOcr: number | null;
  lowConfidenceLines: { pagina: number; texto: string; confianca: number }[];
  fileUrl: string;
}

export async function uploadImport(file: File): Promise<ImportDetail> {
  const API_URL = getApiBaseUrl();
  const token = readClientToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/admin/imports/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? 'Erro no upload');
  }
  return res.json();
}

export function getImport(id: string) {
  return adminFetch<ImportDetail>(`/admin/imports/${id}`);
}

export function reprocessOcr(id: string) {
  return adminFetch<ImportDetail>(`/admin/imports/${id}/reprocess-ocr`, { method: 'POST' });
}

export function updateOcrPages(id: string, pages: { pagina: number; texto: string }[]) {
  return adminFetch<ImportDetail>(`/admin/imports/${id}/ocr`, {
    method: 'PATCH',
    body: JSON.stringify({ pages }),
  });
}

export function approveOcr(id: string) {
  return adminFetch<ImportDetail>(`/admin/imports/${id}/ocr/approve`, { method: 'POST' });
}

export function confirmImport(
  id: string,
  meta?: { tipo?: string; numero?: number; ano?: number; ementa?: string; orgaoOrigem?: string },
) {
  return adminFetch<{ actId: string; codigo: string; editorUrl: string }>(
    `/admin/imports/${id}/confirm`,
    { method: 'POST', body: JSON.stringify(meta ?? {}) },
  );
}

export async function fetchImportFileUrl(importId: string): Promise<string> {
  const API_URL = getApiBaseUrl();
  const token = readClientToken();
  const res = await fetch(`${API_URL}/admin/imports/${importId}/file`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Não foi possível carregar o arquivo');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export type { AdminListResponse };
