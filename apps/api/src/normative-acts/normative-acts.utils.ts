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

/** Título formal institucional: "DECRETO Nº 10.766, DE 16 DE MAIO DE 2018". */
export function formatFormalTitle(
  tipo: ActType,
  numero: number,
  ano: number,
  dataAto?: Date | string | null,
): string {
  const typeLabel = ACT_TYPE_LABELS[tipo].toUpperCase();
  const num = numero.toLocaleString('pt-BR');

  if (dataAto) {
    const d = typeof dataAto === 'string' ? new Date(dataAto) : dataAto;
    if (!Number.isNaN(d.getTime())) {
      const day = d.getUTCDate();
      const month = MONTHS_PT[d.getUTCMonth()];
      const year = d.getUTCFullYear();
      return `${typeLabel} Nº ${num}, DE ${day} DE ${month} DE ${year}`;
    }
  }

  return `${typeLabel} Nº ${num}, DE ${ano}`;
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
