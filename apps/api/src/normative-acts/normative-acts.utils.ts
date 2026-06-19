import { ActSituacao, ActType } from '@prisma/client';

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

export function formatActCode(tipo: ActType, numero: number, ano: number): string {
  return `${ACT_TYPE_LABELS[tipo]} nº ${numero.toLocaleString('pt-BR')}/${ano}`;
}

export function parseSlug(slug: string): { tipo: string; ano: number; numero: number } | null {
  const parts = slug.split('/');
  if (parts.length !== 3) return null;
  const [tipo, anoStr, numeroStr] = parts;
  const ano = Number(anoStr);
  const numero = Number(numeroStr);
  if (!tipo || Number.isNaN(ano) || Number.isNaN(numero)) return null;
  return { tipo, ano, numero };
}

export function slugFromParams(tipo: string, ano: string, numero: string): string {
  return `${tipo}/${ano}/${numero}`;
}

export function actTypeToSlug(tipo: ActType): string {
  return tipo.replace(/_/g, '-');
}

export function buildActSlug(tipo: ActType, ano: number, numero: number): string {
  return `${actTypeToSlug(tipo)}/${ano}/${numero}`;
}
