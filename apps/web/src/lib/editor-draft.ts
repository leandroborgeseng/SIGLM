/**
 * Rascunho local do Editor de Texto Estruturado — recuperação após falha de sessão.
 */

import type { NormativeUnit } from '@/lib/types';

const PREFIX = 'siglm:editor-draft:';

export type EditorDraftPayload = {
  actId: string;
  savedAt: string;
  assunto: string;
  dataAto: string;
  dataPublicacao: string;
  meioPublicacaoId: string;
  orgaoOrigemIds: string[];
  atoConjunto: boolean;
  prefixoTituloModo: string;
  prefixoTitulo: string;
  signatories: { signatoryId?: string | null; nome: string; cargo: string; ordem: number }[];
  units: NormativeUnit[];
};

export function draftKey(actId: string) {
  return `${PREFIX}${actId}`;
}

export function saveEditorDraft(payload: EditorDraftPayload) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      draftKey(payload.actId),
      JSON.stringify({ ...payload, savedAt: new Date().toISOString() }),
    );
  } catch {
    /* quota / private mode */
  }
}

export function loadEditorDraft(actId: string): EditorDraftPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(draftKey(actId));
    if (!raw) return null;
    const data = JSON.parse(raw) as EditorDraftPayload;
    if (data.actId !== actId || !Array.isArray(data.units)) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearEditorDraft(actId: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(draftKey(actId));
  } catch {
    /* ignore */
  }
}
