import type { ActSituacao, ActType } from './types';

export const ACT_TYPE_LABELS: Record<ActType, string> = {
  lei_complementar: 'Lei Complementar',
  lei: 'Lei',
  decreto: 'Decreto',
  portaria: 'Portaria',
  resolucao: 'Resolução',
  instrucao_normativa: 'Instrução Normativa',
};

export const SITUACAO_LABELS: Record<ActSituacao, string> = {
  vigente: 'Vigente',
  revogado: 'Revogado',
  parcialmente_revogado: 'Parcialmente revogado',
  alterado: 'Alterado',
  consolidado: 'Consolidado',
};

export const ACT_TYPES: ActType[] = [
  'lei_complementar',
  'lei',
  'decreto',
  'portaria',
  'resolucao',
  'instrucao_normativa',
];

export const SITUACOES: ActSituacao[] = [
  'vigente',
  'consolidado',
  'parcialmente_revogado',
  'alterado',
  'revogado',
];

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function actUrl(slug: string): string {
  const parts = slug.split('/');
  if (parts.length === 3) return `/legislacao/${parts[0]}/${parts[1]}/${parts[2]}`;
  return `/legislacao`;
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
