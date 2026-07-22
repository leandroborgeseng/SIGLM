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
    timeZone: 'UTC',
  });
}

const MONTHS_PT = [
  'JANEIRO',
  'FEVEREIRO',
  'MARÇO',
  'ABRIL',
  'MAIO',
  'JUNHO',
  'JULHO',
  'AGOSTO',
  'SETEMBRO',
  'OUTUBRO',
  'NOVEMBRO',
  'DEZEMBRO',
] as const;

/** Título formal: "DECRETO Nº 10.766, DE 16 DE MAIO DE 2018". */
export function formatFormalTitle(
  tipo: ActType,
  numero: number,
  ano: number,
  dataAto?: string | null,
): string {
  const typeLabel = ACT_TYPE_LABELS[tipo].toUpperCase();
  const num = numero.toLocaleString('pt-BR');

  if (dataAto) {
    const d = new Date(dataAto);
    if (!Number.isNaN(d.getTime())) {
      const day = d.getUTCDate();
      const month = MONTHS_PT[d.getUTCMonth()];
      const year = d.getUTCFullYear();
      return `${typeLabel} Nº ${num}, DE ${day} DE ${month} DE ${year}`;
    }
  }

  return `${typeLabel} Nº ${num}, DE ${ano}`;
}

export function toDateInputValue(date: string | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function actUrl(slug: string): string {
  const parts = slug.split('/');
  if (parts.length === 3) return `/legislacao/${parts[0]}/${parts[1]}/${parts[2]}`;
  return `/legislacao`;
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
