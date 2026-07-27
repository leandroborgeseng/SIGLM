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

export type ActCodeOptions = {
  atoConjunto?: boolean;
  /** Prefixo já resolvido (manual ou auto com siglas). */
  prefixo?: string | null;
};

const FEMININE_ACT_TYPES: ReadonlySet<ActType> = new Set([
  ActType.lei,
  ActType.lei_complementar,
  ActType.resolucao,
  ActType.portaria,
  ActType.instrucao_normativa,
]);

/** "Conjunta" / "Conjunto" conforme o gênero do tipo do ato. */
export function conjuntoSuffix(tipo: ActType, atoConjunto?: boolean, upper = false): string {
  if (!atoConjunto) return '';
  const word = FEMININE_ACT_TYPES.has(tipo) ? 'Conjunta' : 'Conjunto';
  return upper ? ` ${word.toUpperCase()}` : ` ${word}`;
}

/** Título resumido: "{Tipo}[ Conjunt{a|o}][ {PREFIXO}] nº {n}/{ano}". */
export function formatActCode(
  tipo: ActType,
  numero: number,
  ano: number,
  options?: ActCodeOptions,
): string {
  const typeLabel = ACT_TYPE_LABELS[tipo];
  const conjunto = conjuntoSuffix(tipo, options?.atoConjunto);
  const prefixo = options?.prefixo?.trim() ? ` ${options.prefixo.trim()}` : '';
  return `${typeLabel}${conjunto}${prefixo} nº ${numero.toLocaleString('pt-BR')}/${ano}`;
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

export type FormalTitleOptions = {
  atoConjunto?: boolean;
  /** Prefixo já resolvido (manual ou auto com siglas). */
  prefixo?: string | null;
};

/** Título formal: "{TIPO}[ CONJUNT{A|O}][ {PREFIXO}] Nº {n}, DE {data}". */
export function formatFormalTitle(
  tipo: ActType,
  numero: number,
  ano: number,
  dataAto?: Date | string | null,
  options?: FormalTitleOptions,
): string {
  const typeLabel = ACT_TYPE_LABELS[tipo].toUpperCase();
  const num = numero.toLocaleString('pt-BR');
  const conjunto = conjuntoSuffix(tipo, options?.atoConjunto, true);
  const prefixo = options?.prefixo?.trim() ? ` ${options.prefixo.trim().toUpperCase()}` : '';
  const head = `${typeLabel}${conjunto}${prefixo}`;

  if (dataAto) {
    const d = typeof dataAto === 'string' ? new Date(dataAto) : dataAto;
    if (!Number.isNaN(d.getTime())) {
      const day = d.getUTCDate();
      const month = MONTHS_PT[d.getUTCMonth()];
      const year = d.getUTCFullYear();
      return `${head} Nº ${num}, DE ${day} DE ${month} DE ${year}`;
    }
  }

  return `${head} Nº ${num}, DE ${ano}`;
}

/** Resolve prefixo do título conforme modo (none | auto | manual). */
export function resolveTituloPrefixo(
  modo: string | null | undefined,
  prefixoManual: string | null | undefined,
  orgs: { sigla?: string | null; nome?: string | null }[],
): string | null {
  if (modo === 'manual') {
    const p = prefixoManual?.trim();
    return p || null;
  }
  if (modo === 'auto') {
    const parts = orgs
      .map((o) => o.sigla?.trim() || o.nome?.trim())
      .filter((v): v is string => Boolean(v));
    return parts.length ? parts.join('/') : null;
  }
  return null;
}

/** Data longa pt-BR (UTC), igual ao formatDate do web. */
export function formatDateLong(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
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
