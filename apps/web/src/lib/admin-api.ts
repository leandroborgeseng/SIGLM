import type { ActAttachment, ActDetail, AdminActDetail, AdminListResponse, LegislativeEffect } from './types';
import { AuthError, ForbiddenError } from './api';
import { getApiBaseUrl } from './api-url';
import {
  authorizedFetch,
  ensureFreshAccessToken,
  forceRefreshAccessToken,
  readAccessToken,
} from './auth-session';

function readClientToken(): string | undefined {
  return readAccessToken();
}

async function adminFetch<T>(
  path: string,
  init?: RequestInit,
  token?: string,
): Promise<T> {
  const API_URL = getApiBaseUrl();
  // Garante access válido (renova via refresh se necessário) antes da chamada.
  if (!token) await ensureFreshAccessToken();
  const authToken = token ?? readAccessToken();
  let res: Response;
  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...init?.headers,
    };
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
    });
    if (res.status === 401 && !token) {
      const fresh = await forceRefreshAccessToken();
      if (fresh) {
        res = await fetch(`${API_URL}${path}`, {
          ...init,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${fresh}`,
            ...init?.headers,
          },
          cache: 'no-store',
        });
      }
    }
  } catch {
    throw new Error('Não foi possível conectar à API');
  }
  if (res.status === 401) throw new AuthError('Não autenticado');
  if (res.status === 403) throw new ForbiddenError('Permissão insuficiente');
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
  dataAto?: string;
  orgaoOrigem?: string;
  orgaoOrigemId?: string;
}

export interface OriginOrg {
  id: string;
  nome: string;
  sigla?: string | null;
  ativo: boolean;
  _count?: { acts: number };
}

export interface PublicationMedium {
  id: string;
  nome: string;
  ativo: boolean;
  _count?: { acts: number };
}

export interface AdminSignatory {
  id: string;
  nome: string;
  cargo: string;
  orgaoId?: string | null;
  ativo: boolean;
  orgao?: { id: string; nome: string; sigla?: string | null } | null;
  _count?: { links: number };
}

/** Alias do tipo de catálogo de signatários. */
export type Signatory = AdminSignatory;

export interface AdminUser {
  id: string;
  nome: string;
  email: string;
  ativo: boolean;
  mustChangePassword: boolean;
  role: { id: string; nome: string; descricao: string | null };
  rolesCount: number;
  primaryOrg: { id: string; nome: string; sigla?: string | null } | null;
  orgsCount: number;
  roleLinks: {
    roleId: string;
    isPrimary: boolean;
    role: { id: string; nome: string; descricao: string | null };
  }[];
  orgLinks: {
    orgaoId: string;
    isPrimary: boolean;
    orgao: { id: string; nome: string; sigla?: string | null };
  }[];
}

export interface AdminRole {
  id: string;
  nome: string;
  descricao: string | null;
  permissions: { permission: { id: string; chave: string } }[];
  _count?: { users: number };
}

export function listOrgans(ativosOnly = false, token?: string) {
  const q = ativosOnly ? '?ativos=true' : '';
  return adminFetch<OriginOrg[]>(`/admin/organs${q}`, undefined, token);
}

export function createOrgan(nome: string, sigla?: string | null, token?: string) {
  return adminFetch<OriginOrg>('/admin/organs', {
    method: 'POST',
    body: JSON.stringify({ nome, sigla: sigla || null }),
  }, token);
}

export function listPublicationMedia(ativosOnly = false, token?: string) {
  const q = ativosOnly ? '?ativos=true' : '';
  return adminFetch<PublicationMedium[]>(`/admin/publication-media${q}`, undefined, token);
}

export function createPublicationMedium(nome: string, token?: string) {
  return adminFetch<PublicationMedium>('/admin/publication-media', {
    method: 'POST',
    body: JSON.stringify({ nome }),
  }, token);
}

export function updatePublicationMedium(
  id: string,
  data: { nome?: string; ativo?: boolean },
  token?: string,
) {
  return adminFetch<PublicationMedium>(`/admin/publication-media/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }, token);
}

export function listSignatories(ativosOnly = false, token?: string) {
  const q = ativosOnly ? '?ativos=true' : '';
  return adminFetch<AdminSignatory[]>(`/admin/signatories${q}`, undefined, token);
}

export function createSignatory(
  data: { nome: string; cargo: string; orgaoId?: string | null },
  token?: string,
) {
  return adminFetch<AdminSignatory>('/admin/signatories', {
    method: 'POST',
    body: JSON.stringify(data),
  }, token);
}

export function updateSignatory(
  id: string,
  data: { nome?: string; cargo?: string; orgaoId?: string | null; ativo?: boolean },
  token?: string,
) {
  return adminFetch<AdminSignatory>(`/admin/signatories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }, token);
}

export function updateOrgan(
  id: string,
  data: { nome?: string; sigla?: string | null; ativo?: boolean },
  token?: string,
) {
  return adminFetch<OriginOrg>(`/admin/organs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }, token);
}

export function listUsers(token?: string) {
  return adminFetch<AdminUser[]>('/admin/users', undefined, token);
}

export function createUser(
  data: {
    nome: string;
    email: string;
    senha: string;
    roleIds: string[];
    primaryRoleId?: string;
    orgaoIds?: string[];
    primaryOrgaoId?: string;
    mustChangePassword?: boolean;
  },
  token?: string,
) {
  return adminFetch<AdminUser>('/admin/users', {
    method: 'POST',
    body: JSON.stringify(data),
  }, token);
}

export function updateUser(
  id: string,
  data: {
    nome?: string;
    email?: string;
    senha?: string;
    roleIds?: string[];
    primaryRoleId?: string;
    orgaoIds?: string[];
    primaryOrgaoId?: string | null;
    ativo?: boolean;
    mustChangePassword?: boolean;
  },
  token?: string,
) {
  return adminFetch<AdminUser>(`/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  }, token);
}

export function listRoles(token?: string) {
  return adminFetch<AdminRole[]>('/admin/roles', undefined, token);
}

export function listPermissions(token?: string) {
  return adminFetch<{ id: string; chave: string }[]>('/admin/permissions', undefined, token);
}

export function setRolePermissions(roleId: string, permissionIds: string[], token?: string) {
  return adminFetch<AdminRole>(`/admin/roles/${roleId}/permissions`, {
    method: 'PATCH',
    body: JSON.stringify({ permissionIds }),
  }, token);
}

export interface UserPermissionsDetail {
  userId: string;
  userNome: string;
  activeRoleId?: string;
  role: {
    id: string;
    nome: string;
    permissions: { id: string; chave: string }[];
  };
  linkedRoles?: { id: string; nome: string; isPrimary: boolean }[];
  extraPermissions: { id: string; chave: string }[];
  effectivePermissions: {
    id: string;
    chave: string;
    source: 'role' | 'extra';
  }[];
}

export function getUserPermissions(userId: string, token?: string) {
  return adminFetch<UserPermissionsDetail>(`/admin/users/${userId}/permissions`, undefined, token);
}

export function setUserExtraPermissions(userId: string, permissionIds: string[], token?: string) {
  return adminFetch<UserPermissionsDetail>(`/admin/users/${userId}/permissions`, {
    method: 'PATCH',
    body: JSON.stringify({ permissionIds }),
  }, token);
}

export interface UnitPayload {
  id?: string;
  tipoUnidade: string;
  identificacao?: string | null;
  texto: string;
  ordem: number;
  parentUnitId?: string | null;
  formatacao?: {
    align?: 'left' | 'center' | 'right' | 'justify';
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    letterSpacing?: 'normal' | 'expanded';
  } | null;
}

export function adminListActs(
  params?: {
    q?: string;
    tipo?: string;
    situacao?: string;
    statusPublicacao?: string;
    etapaEditorial?: string;
    norma?: string;
    ementa?: string;
    publicadoDe?: string;
    publicadoAte?: string;
    orgaoOrigemId?: string;
    numeroDe?: string;
    numeroAte?: string;
    meioPublicacaoId?: string;
    signatarioNome?: string;
    responsavelEstruturacaoId?: string;
    responsavelRevisaoId?: string;
    page?: number;
    limit?: number;
  },
  token?: string,
) {
  const qs = new URLSearchParams();
  if (params?.q) qs.set('q', params.q);
  if (params?.tipo) qs.set('tipo', params.tipo);
  if (params?.situacao) qs.set('situacao', params.situacao);
  if (params?.statusPublicacao) qs.set('statusPublicacao', params.statusPublicacao);
  if (params?.etapaEditorial) qs.set('etapaEditorial', params.etapaEditorial);
  if (params?.norma) qs.set('norma', params.norma);
  if (params?.ementa) qs.set('ementa', params.ementa);
  if (params?.publicadoDe) qs.set('publicadoDe', params.publicadoDe);
  if (params?.publicadoAte) qs.set('publicadoAte', params.publicadoAte);
  if (params?.orgaoOrigemId) qs.set('orgaoOrigemId', params.orgaoOrigemId);
  if (params?.numeroDe) qs.set('numeroDe', params.numeroDe);
  if (params?.numeroAte) qs.set('numeroAte', params.numeroAte);
  if (params?.meioPublicacaoId) qs.set('meioPublicacaoId', params.meioPublicacaoId);
  if (params?.signatarioNome) qs.set('signatarioNome', params.signatarioNome);
  if (params?.responsavelEstruturacaoId) qs.set('responsavelEstruturacaoId', params.responsavelEstruturacaoId);
  if (params?.responsavelRevisaoId) qs.set('responsavelRevisaoId', params.responsavelRevisaoId);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return adminFetch<AdminListResponse>(`/admin/acts${q ? `?${q}` : ''}`, undefined, token);
}

export interface AdminFilterOptions {
  orgaos: OriginOrg[];
  meios: PublicationMedium[];
  signatarios: string[];
  users: { id: string; nome: string; email: string; ativo: boolean }[];
}

export interface BatchUpdateActsPayload {
  actIds?: string[];
  selectAllFiltered?: boolean;
  action:
    | 'set_responsavel_estruturacao'
    | 'set_responsavel_revisao'
    | 'set_meio_publicacao'
    | 'set_signatario';
  responsavelEstruturacaoId?: string | null;
  responsavelRevisaoId?: string | null;
  meioPublicacaoId?: string | null;
  signatory?: {
    signatoryId?: string | null;
    nome: string;
    cargo: string;
    mode: 'append' | 'replace';
  };
  tipo?: string;
  situacao?: string;
  statusPublicacao?: string;
  etapaEditorial?: string;
  norma?: string;
  ementa?: string;
  publicadoDe?: string;
  publicadoAte?: string;
  orgaoOrigemId?: string;
  numeroDe?: string;
  numeroAte?: string;
  meioPublicacaoIdFilter?: string;
  signatarioNome?: string;
  responsavelEstruturacaoIdFilter?: string;
  responsavelRevisaoIdFilter?: string;
}

export interface BatchUpdateActsResult {
  action: string;
  actionLabel: string;
  totalSelected: number;
  processedCount: number;
  skippedCount: number;
  processed: { actId: string; codigo: string }[];
  skipped: { actId: string; codigo: string; reason: string }[];
  summary: string;
}

export function batchUpdateActs(payload: BatchUpdateActsPayload, token?: string) {
  return adminFetch<BatchUpdateActsResult>('/admin/acts/batch', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, token);
}

export function returnActToStructuring(id: string, token?: string) {
  return adminFetch<AdminActDetail>(`/admin/acts/${id}/return-to-structuring`, {
    method: 'POST',
  }, token);
}

export function getAdminFilterOptions(token?: string) {
  return adminFetch<AdminFilterOptions>('/admin/acts/filter-options', undefined, token);
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

export function saveLegislativeEffects(id: string, effects: LegislativeEffect[], token?: string) {
  return adminFetch<ActDetail>(`/admin/acts/${id}/legislative-effects`, {
    method: 'PUT',
    body: JSON.stringify({ effects }),
  }, token);
}

export function addUnit(
  id: string,
  payload: {
    tipoUnidade: string;
    identificacao?: string;
    texto?: string;
    parentUnitId?: string | null;
    afterUnitId?: string | null;
    formatacao?: UnitPayload['formatacao'];
  },
  token?: string,
) {
  return adminFetch<ActDetail>(`/admin/acts/${id}/units`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, token);
}

export function deleteUnit(
  id: string,
  unitId: string,
  payload: {
    mode: 'cascade' | 'reparent';
    newParentId?: string | null;
    confirmEffectCleanup?: boolean;
  },
  token?: string,
) {
  return adminFetch<ActDetail>(`/admin/acts/${id}/units/${unitId}`, {
    method: 'DELETE',
    body: JSON.stringify(payload),
  }, token);
}

export function submitForReview(id: string, token?: string) {
  return adminFetch<ActDetail>(`/admin/acts/${id}/submit-review`, { method: 'POST' }, token);
}

export function publishAct(id: string, token?: string) {
  return adminFetch<ActDetail>(`/admin/acts/${id}/publish`, { method: 'POST' }, token);
}

export function createActEdition(id: string, token?: string) {
  return adminFetch<ActDetail>(`/admin/acts/${id}/create-edition`, { method: 'POST' }, token);
}

export type ActAttachmentsBundle = {
  original: ActAttachment | null;
  publicacao: ActAttachment | null;
  historicoPublicacao?: ActAttachment[];
  topo: ActAttachment[];
  final: ActAttachment[];
  historico: ActAttachment[];
  all: ActAttachment[];
};

export function listActAttachments(actId: string, token?: string) {
  return adminFetch<ActAttachmentsBundle>(`/admin/acts/${actId}/attachments`, {}, token);
}

export async function uploadActOriginal(actId: string, file: File): Promise<ActAttachment> {
  const API_URL = getApiBaseUrl();
  const form = new FormData();
  form.append('file', file);
  const res = await authorizedFetch(`${API_URL}/admin/acts/${actId}/attachments/original`, {
    method: 'POST',
    body: form,
  });
  if (res.status === 401) throw new AuthError('Não autenticado');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? 'Erro ao enviar arquivo original');
  }
  return res.json();
}

export async function uploadActPublication(actId: string, file: File): Promise<ActAttachment> {
  const API_URL = getApiBaseUrl();
  const form = new FormData();
  form.append('file', file);
  const res = await authorizedFetch(`${API_URL}/admin/acts/${actId}/attachments/publicacao`, {
    method: 'POST',
    body: form,
  });
  if (res.status === 401) throw new AuthError('Não autenticado');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? 'Erro ao enviar arquivo da publicação');
  }
  return res.json();
}

export async function createActSupplement(
  actId: string,
  data: {
    secao: 'topo' | 'final';
    titulo: string;
    modo: 'arquivo' | 'hiperlink';
    href?: string;
    file?: File | null;
  },
): Promise<ActAttachment> {
  const API_URL = getApiBaseUrl();
  const form = new FormData();
  form.append('secao', data.secao);
  form.append('titulo', data.titulo);
  form.append('modo', data.modo);
  if (data.href) form.append('href', data.href);
  if (data.file) form.append('file', data.file);
  const res = await authorizedFetch(
    `${API_URL}/admin/acts/${actId}/attachments/supplements`,
    { method: 'POST', body: form },
  );
  if (res.status === 401) throw new AuthError('Não autenticado');
  if (res.status === 403) throw new ForbiddenError('Permissão insuficiente');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? 'Erro ao criar item');
  }
  return res.json();
}

export function updateActSupplement(
  actId: string,
  attachmentId: string,
  data: { titulo?: string; href?: string; ordem?: number },
  token?: string,
) {
  return adminFetch<ActAttachment>(
    `/admin/acts/${actId}/attachments/supplements/${attachmentId}`,
    { method: 'PATCH', body: JSON.stringify(data) },
    token,
  );
}

export function reorderActSupplements(
  actId: string,
  secao: 'topo' | 'final',
  orderedIds: string[],
  token?: string,
) {
  return adminFetch<ActAttachmentsBundle>(
    `/admin/acts/${actId}/attachments/supplements/reorder`,
    { method: 'PUT', body: JSON.stringify({ secao, orderedIds }) },
    token,
  );
}

export function removeActSupplement(actId: string, attachmentId: string, token?: string) {
  return adminFetch<{ ok: boolean }>(
    `/admin/acts/${actId}/attachments/supplements/${attachmentId}`,
    { method: 'DELETE' },
    token,
  );
}

export function restoreUnitVersion(actId: string, unitId: string, versionId: string, token?: string) {
  return adminFetch<ActDetail>(
    `/admin/acts/${actId}/units/${unitId}/restore/${versionId}`,
    { method: 'POST' },
    token,
  );
}

export interface ActHistoryEntry {
  id: string;
  actId: string;
  userId: string | null;
  acao: string;
  resumo: string | null;
  revisionNumber: number | null;
  createdAt: string;
  snapshot?: unknown;
  user?: { id: string; nome: string; email: string } | null;
}

export function listActInternalHistory(actId: string, token?: string) {
  return adminFetch<ActHistoryEntry[]>(`/admin/acts/${actId}/history`, {}, token);
}

export function getActHistoryEntry(actId: string, entryId: string, token?: string) {
  return adminFetch<ActHistoryEntry>(`/admin/acts/${actId}/history/${entryId}`, {}, token);
}

export function compareActHistory(actId: string, leftId: string, rightId: string, token?: string) {
  return adminFetch<{
    left: { id: string; acao: string; createdAt: string; resumo: string | null };
    right: { id: string; acao: string; createdAt: string; resumo: string | null };
    diff: {
      metaChanges: { campo: string; de: unknown; para: unknown }[];
      units: {
        added: unknown[];
        removed: unknown[];
        changed: unknown[];
        orderChanged: boolean;
      };
    };
  }>(`/admin/acts/${actId}/history-compare?left=${leftId}&right=${rightId}`, {}, token);
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
  parentUnitId?: string | null;
}

export interface ConsolidationPreview {
  normaAlteradora: { id: string; codigo: string };
  sourceUnit?: { id: string; identificacao: string | null };
  normaAlterada: { id: string; codigo: string };
  dispositivo: string | null;
  tipoAlteracao: string;
  textoAnterior: string | null;
  textoNovo: string | null;
  notaGerada: string;
  data: string;
}

export interface ConsolidationLink {
  id: string;
  origem: 'interna' | 'externa';
  incomplete: boolean;
  tipoAlteracao: string;
  data: string;
  notaGerada: string | null;
  fundamento: string | null;
  normaAlteradora: { id: string; codigo: string; slug: string } | null;
  normaAlterada: { id: string; codigo: string; slug: string };
  sourceUnit: { id: string; identificacao: string | null } | null;
  targetUnit: { id: string; identificacao: string | null } | null;
  externalSource: {
    id: string;
    tipo?: string | null;
    numero?: string | null;
    ano?: number | null;
    emissor: string;
    descricao: string;
    url?: string | null;
    processo?: string | null;
    tribunal?: string | null;
  } | null;
  autor: { id: string; nome: string } | null;
  createdAt: string;
}

export interface ExternalEffectPayload {
  source: {
    tipo?: string;
    numero?: string;
    ano?: number;
    emissor: string;
    data?: string;
    descricao: string;
    url?: string;
    arquivoUrl?: string;
    processo?: string;
    tribunal?: string;
  };
  normaAlteradaActId: string;
  tipoAlteracao: string;
  unitId?: string;
  textoNovo?: string;
  identificacao?: string;
  data?: string;
  fundamento?: string;
  referenciaUnitId?: string;
  posicionamento?: string;
  tipoDispositivoIncluido?: string;
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

export function listConsolidationLinks(
  params?: {
    normaAlteradaActId?: string;
    normaAlteradoraActId?: string;
    incompleteOnly?: boolean;
  },
  token?: string,
) {
  const qs = new URLSearchParams();
  if (params?.normaAlteradaActId) qs.set('normaAlteradaActId', params.normaAlteradaActId);
  if (params?.normaAlteradoraActId) qs.set('normaAlteradoraActId', params.normaAlteradoraActId);
  if (params?.incompleteOnly) qs.set('incompleteOnly', 'true');
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return adminFetch<ConsolidationLink[]>(`/admin/consolidation/links${suffix}`, undefined, token);
}

export function correctConsolidationLink(
  linkId: string,
  payload: { sourceUnitId: string; regenerateNote?: boolean },
  token?: string,
) {
  return adminFetch<ConsolidationLink>(`/admin/consolidation/links/${linkId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  }, token);
}

export function registerExternalEffect(payload: ExternalEffectPayload, token?: string) {
  return adminFetch<{ success: boolean; notaGerada: string }>(
    '/admin/consolidation/external',
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  );
}

export interface SuggestedImportEffect {
  id: string;
  sourceBlockOrdem: number;
  sourceTag: string;
  normaCodigo: string | null;
  targetIdentificacao: string | null;
  tipoEfeito: string;
  textoNovo: string | null;
  confianca: number;
  trecho: string;
  aceito: boolean;
}

export interface ImportDetail {
  id: string;
  arquivo: string;
  arquivoOriginal: string;
  formato: string;
  lib: string | null;
  status: string;
  estruturaDetectada: {
    blocos: {
      tag: string;
      tipo: string;
      texto: string;
      confianca: number;
      ordem: number;
      parentOrdem?: number | null;
      formatacao?: {
        align?: 'left' | 'center' | 'right' | 'justify';
        bold?: boolean;
        italic?: boolean;
        underline?: boolean;
        letterSpacing?: 'normal' | 'expanded';
      } | null;
    }[];
    mediaConfianca: number;
    ocrAprovado?: boolean;
    efeitosSugeridos?: SuggestedImportEffect[];
    metadados?: {
      tipo: string | null;
      numero: number | null;
      ano: number | null;
      dataAto?: string | null;
      ementa: string | null;
      tituloCompleto: string | null;
      confianca: number;
    };
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
  const form = new FormData();
  form.append('file', file);
  const res = await authorizedFetch(`${API_URL}/admin/imports/upload`, {
    method: 'POST',
    body: form,
  });
  if (res.status === 401) throw new AuthError('Não autenticado');
  if (res.status === 403) throw new ForbiddenError('Permissão insuficiente');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? 'Erro no upload');
  }
  return res.json();
}

export function getImport(id: string) {
  return adminFetch<ImportDetail>(`/admin/imports/${id}`);
}

export function reprocessImport(id: string) {
  return adminFetch<ImportDetail>(`/admin/imports/${id}/reprocess`, { method: 'POST' });
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
  meta?: {
    tipo?: string;
    numero?: number;
    ano?: number;
    dataAto?: string;
    ementa?: string;
    orgaoOrigem?: string;
    efeitosAceitos?: string[];
    blocos?: {
      tag: string;
      tipo: string;
      texto: string;
      confianca: number;
      ordem: number;
      parentOrdem?: number | null;
    }[];
  },
) {
  return adminFetch<{ actId: string; codigo: string; editorUrl: string }>(
    `/admin/imports/${id}/confirm`,
    { method: 'POST', body: JSON.stringify(meta ?? {}) },
  );
}

export function updateImportStructure(
  id: string,
  blocos: {
    tag: string;
    tipo: string;
    texto: string;
    confianca: number;
    ordem: number;
    parentOrdem?: number | null;
  }[],
) {
  return adminFetch<ImportDetail>(`/admin/imports/${id}/structure`, {
    method: 'PATCH',
    body: JSON.stringify({ blocos }),
  });
}

async function fetchAuthorizedBlobUrl(
  path: string,
  fallbackMessage: string,
): Promise<string> {
  const API_URL = getApiBaseUrl();
  let res: Response;
  try {
    res = await authorizedFetch(`${API_URL}${path}`);
  } catch {
    throw new Error('Falha temporária de conexão ao carregar o arquivo');
  }
  if (res.status === 401 || res.status === 403) {
    throw new AuthError(
      res.status === 401
        ? 'Sessão expirada — tente novamente para renovar o acesso'
        : 'Sem permissão para acessar este arquivo',
    );
  }
  if (res.status === 404) {
    const body = await res.json().catch(() => ({}));
    const msg = Array.isArray(body.message)
      ? body.message.join(', ')
      : typeof body.message === 'string'
        ? body.message
        : 'Arquivo inexistente no armazenamento';
    throw new Error(msg);
  }
  if (!res.ok) {
    throw new Error(fallbackMessage);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function fetchImportFileUrl(importId: string): Promise<string> {
  return fetchAuthorizedBlobUrl(
    `/admin/imports/${importId}/file`,
    'Não foi possível carregar o arquivo da importação',
  );
}

/** Obtém URL blob atualizada do anexo permanente (renova sessão se necessário). */
export async function fetchActAttachmentFileUrl(
  actId: string,
  attachmentId: string,
): Promise<string> {
  return fetchAuthorizedBlobUrl(
    `/admin/acts/${actId}/attachments/${attachmentId}/file`,
    'Não foi possível carregar o arquivo original',
  );
}

export function repairOriginalAttachments() {
  return adminFetch<{
    total: number;
    ok: number;
    repaired: { id: string; actId: string; slug: string; newUrl: string }[];
    missing: { id: string; actId: string; slug: string; url: string; motivo: string }[];
  }>('/admin/attachments/repair-originals', { method: 'POST' });
}

export type ArchiveImportItem = {
  id: string;
  nomeArquivo: string;
  formato: string;
  status: string;
  tipo: string | null;
  numero: number | null;
  ano: number | null;
  dataAto: string | null;
  ementa: string | null;
  confianca: number;
  erroMensagem: string | null;
  resolucao: string | null;
  actId: string | null;
  textoIdentificadoImportacao: string | null;
  textoIdentificadoOrigem: string | null;
  textoIdentificadoAusente: boolean;
  existingAct: { id: string; codigo: string; slug: string; ementa: string } | null;
  fileUrl: string | null;
};

export type ArchiveImportBatch = {
  id: string;
  status: string;
  criadoEm: string;
  concluidoEm: string | null;
  criadoPor: { id: string; nome: string; email: string } | null;
  counts: Record<string, number>;
  items: ArchiveImportItem[];
};

export async function uploadArchiveImportBatch(files: File[]): Promise<ArchiveImportBatch> {
  const API_URL = getApiBaseUrl();
  const form = new FormData();
  for (const f of files) form.append('files', f);
  const res = await authorizedFetch(`${API_URL}/admin/archive-imports/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = Array.isArray(err.message) ? err.message.join(', ') : err.message;
    throw new Error(msg ?? 'Erro no upload do acervo');
  }
  return res.json();
}

export function getArchiveImportBatch(batchId: string) {
  return adminFetch<ArchiveImportBatch>(`/admin/archive-imports/${batchId}`);
}

export function updateArchiveImportItem(
  batchId: string,
  itemId: string,
  patch: {
    tipo?: string | null;
    numero?: number | null;
    ano?: number | null;
    dataAto?: string | null;
    ementa?: string | null;
    resolucao?: 'ignore' | 'link' | 'create' | null;
    textoIdentificadoImportacao?: string | null;
  },
) {
  return adminFetch<ArchiveImportBatch>(`/admin/archive-imports/${batchId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function confirmArchiveImportBatch(batchId: string, itemIds: string[]) {
  return adminFetch<{
    batchId: string;
    results: { itemId: string; ok: boolean; actId?: string; codigo?: string; error?: string }[];
    batch: ArchiveImportBatch;
  }>(`/admin/archive-imports/${batchId}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ itemIds }),
  });
}

export async function getArchiveImportItemFileUrl(
  batchId: string,
  itemId: string,
): Promise<string> {
  const API_URL = getApiBaseUrl();
  const res = await authorizedFetch(
    `${API_URL}/admin/archive-imports/${batchId}/items/${itemId}/file`,
  );
  if (!res.ok) throw new Error('Não foi possível carregar o arquivo');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function getArchiveImportItemPreviewHtml(
  batchId: string,
  itemId: string,
): Promise<string> {
  const API_URL = getApiBaseUrl();
  const res = await authorizedFetch(
    `${API_URL}/admin/archive-imports/${batchId}/items/${itemId}/preview`,
  );
  if (!res.ok) throw new Error('Não foi possível gerar preview do documento');
  return res.text();
}

export function updateActIdentifiedImportText(actId: string, textoIdentificadoImportacao: string) {
  return adminFetch<AdminActDetail>(`/admin/acts/${actId}/identified-import-text`, {
    method: 'PATCH',
    body: JSON.stringify({ textoIdentificadoImportacao }),
  });
}

export function identifyActTextFromOriginal(actId: string) {
  return adminFetch<AdminActDetail>(`/admin/acts/${actId}/identify-text-from-original`, {
    method: 'POST',
  });
}

export function startActStructuring(id: string, token?: string) {
  return adminFetch<ActDetail>(`/admin/acts/${id}/start-structuring`, { method: 'POST' }, token);
}

export type StructureFromOriginalResult = {
  act: ActDetail;
  elementCount: number;
  replaced: boolean;
  usedOcr: boolean;
  ocrNote?: string;
  ementaPreserved?: boolean;
  ementaNote?: string;
  arquivo: string;
};

export function structureActFromOriginal(
  id: string,
  body?: { confirmReplace?: boolean },
  token?: string,
) {
  return adminFetch<StructureFromOriginalResult>(
    `/admin/acts/${id}/structure-from-original`,
    {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    },
    token,
  );
}

/** Baixa backup completo (banco + uploads) — apenas admin_geral. */
export async function downloadSystemBackup(): Promise<void> {
  const API_URL = getApiBaseUrl();
  const res = await authorizedFetch(`${API_URL}/admin/system/backup`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = Array.isArray(err.message) ? err.message.join(', ') : err.message;
    throw new Error(msg ?? 'Erro ao gerar backup');
  }
  const blob = await res.blob();
  const disp = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^"]+)"?/i.exec(disp);
  const filename = match?.[1] ?? `siglm-backup-${new Date().toISOString()}.tar.gz`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Restaura backup completo (substitui dados atuais) — apenas admin_geral. */
export async function restoreSystemBackup(file: File) {
  const API_URL = getApiBaseUrl();
  const form = new FormData();
  form.append('file', file);
  const res = await authorizedFetch(`${API_URL}/admin/system/restore`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = Array.isArray(err.message) ? err.message.join(', ') : err.message;
    throw new Error(msg ?? 'Erro ao restaurar backup');
  }
  return res.json() as Promise<{
    ok: boolean;
    message: string;
    restoredFrom: string;
    counts: Record<string, number>;
  }>;
}

export type S3BackupStatus = {
  enabled: boolean;
  configured: boolean;
  hasSecret: boolean;
  bucket: string;
  region: string;
  accessKeyId: string;
  endpoint: string | null;
  forcePathStyle: boolean;
  prefix: string;
  hour: number;
  timezone: string;
  cron: string;
  keepDaily: number;
  keepWeekly: number;
  keepMonthly: number;
  running: boolean;
  lastRun: {
    at: string;
    ok: boolean;
    error?: string;
    uploaded?: { tier: 'daily' | 'weekly' | 'monthly'; key: string }[];
    pruned?: { tier: 'daily' | 'weekly' | 'monthly'; deleted: number }[];
    triggeredBy: 'cron' | 'manual';
  } | null;
};

export type S3BackupConfigInput = {
  enabled: boolean;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey?: string;
  endpoint?: string | null;
  forcePathStyle?: boolean;
  prefix: string;
  hour: number;
  timezone: string;
  keepDaily: number;
  keepWeekly: number;
  keepMonthly: number;
};

/** Configuração + status do backup S3 (sem revelar o secret). */
export function getS3BackupStatus(token?: string) {
  return adminFetch<S3BackupStatus>('/admin/system/backup/s3', undefined, token);
}

/** Salva configuração S3 pela interface. */
export function saveS3BackupConfig(input: S3BackupConfigInput, token?: string) {
  return adminFetch<S3BackupStatus>(
    '/admin/system/backup/s3',
    { method: 'PUT', body: JSON.stringify(input) },
    token,
  );
}

/** Dispara backup S3 agora. */
export function runS3BackupNow(token?: string) {
  return adminFetch<NonNullable<S3BackupStatus['lastRun']>>(
    '/admin/system/backup/s3/run',
    { method: 'POST' },
    token,
  );
}

export type { AdminListResponse };
