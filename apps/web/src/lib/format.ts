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

export type EditorialStage =
  | 'somente_arquivo_original'
  | 'em_estruturacao'
  | 'aguardando_revisao'
  | 'estruturado';

export const ETAPA_EDITORIAL_LABELS: Record<EditorialStage, string> = {
  somente_arquivo_original: 'Somente arquivo original',
  em_estruturacao: 'Em estruturação',
  aguardando_revisao: 'Aguardando revisão',
  estruturado: 'Estruturado',
};

export const ETAPAS_EDITORIAIS: EditorialStage[] = [
  'somente_arquivo_original',
  'em_estruturacao',
  'aguardando_revisao',
  'estruturado',
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

export type FormalTitleOptions = {
  atoConjunto?: boolean;
  /** Prefixo já resolvido (manual ou auto com siglas). */
  prefixo?: string | null;
};

export type ActCodeOptions = FormalTitleOptions;

const FEMININE_ACT_TYPES: ReadonlySet<ActType> = new Set([
  'lei',
  'lei_complementar',
  'resolucao',
  'portaria',
  'instrucao_normativa',
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

/** Título formal: "{TIPO}[ CONJUNT{A|O}][ {PREFIXO}] Nº {n}, DE {data}". */
export function formatFormalTitle(
  tipo: ActType,
  numero: number,
  ano: number,
  dataAto?: string | null,
  options?: FormalTitleOptions,
): string {
  const typeLabel = ACT_TYPE_LABELS[tipo].toUpperCase();
  const num = numero.toLocaleString('pt-BR');
  const conjunto = conjuntoSuffix(tipo, options?.atoConjunto, true);
  const prefixo = options?.prefixo?.trim() ? ` ${options.prefixo.trim().toUpperCase()}` : '';
  const head = `${typeLabel}${conjunto}${prefixo}`;

  if (dataAto) {
    const d = new Date(dataAto);
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

export function toDateInputValue(date: string | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function formatOriginOrgLabel(org: { sigla?: string | null; nome: string }): string {
  const sigla = org.sigla?.trim();
  return sigla ? `${sigla} • ${org.nome}` : org.nome;
}

export function parseNumeroFilter(value: string): number | null {
  const cleaned = value.trim().replace(/\./g, '').replace(/,/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function actUrl(slug: string): string {
  const parts = slug.split('/');
  if (parts.length === 3) return `/legislacao/${parts[0]}/${parts[1]}/${parts[2]}`;
  return `/legislacao`;
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
