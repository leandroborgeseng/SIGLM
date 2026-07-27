import { ActType, ChangeType, EditorialStage } from '@prisma/client';
import { formatActCode } from '../normative-acts/normative-acts.utils';

const FEMININE_ACT_TYPES: ReadonlySet<ActType> = new Set([
  ActType.lei,
  ActType.lei_complementar,
  ActType.resolucao,
  ActType.portaria,
  ActType.instrucao_normativa,
]);

export function unitAnchorId(unit: {
  id: string;
  identificacao: string | null;
  ordem: number;
}): string {
  if (unit.identificacao?.trim()) {
    return unit.identificacao.replace(/\s+/g, '-').toLowerCase();
  }
  return `unit-${unit.ordem}-${unit.id.slice(0, 8)}`;
}

export function actPublicPath(slug: string): string {
  const parts = slug.split('/');
  if (parts.length === 3) return `/legislacao/${parts[0]}/${parts[1]}/${parts[2]}`;
  return '/legislacao';
}

type ActRef = {
  tipo: ActType;
  numero: number;
  ano: number;
  slug: string;
  atoConjunto?: boolean;
  prefixo?: string | null;
  etapaEditorial?: EditorialStage;
};

type SourceUnitRef = {
  id: string;
  identificacao: string | null;
  ordem: number;
};

function actPreposition(tipo: ActType): 'da' | 'do' {
  return FEMININE_ACT_TYPES.has(tipo) ? 'da' : 'do';
}

function formatAlteradoraReference(
  alteradora: ActRef,
  sourceUnit?: Pick<SourceUnitRef, 'identificacao'> | null,
): string {
  const codigo = formatActCode(alteradora.tipo, alteradora.numero, alteradora.ano, {
    atoConjunto: alteradora.atoConjunto,
    prefixo: alteradora.prefixo,
  });
  const ident = sourceUnit?.identificacao?.trim();
  if (ident) {
    return `${ident} ${actPreposition(alteradora.tipo)} ${codigo}`;
  }
  return codigo;
}

export function generateConsolidationNote(
  tipo: ChangeType,
  alteradora: ActRef,
  sourceUnit?: Pick<SourceUnitRef, 'identificacao'> | null,
): string {
  const ref = formatAlteradoraReference(alteradora, sourceUnit);
  switch (tipo) {
    case ChangeType.alteracao_redacao:
      return sourceUnit?.identificacao?.trim()
        ? `Redação dada pelo ${ref}`
        : `Redação dada ${FEMININE_ACT_TYPES.has(alteradora.tipo) ? 'pela' : 'pelo'} ${ref}`;
    case ChangeType.inclusao:
      return sourceUnit?.identificacao?.trim()
        ? `Incluído pelo ${ref}`
        : `Incluído ${FEMININE_ACT_TYPES.has(alteradora.tipo) ? 'pela' : 'pelo'} ${ref}`;
    case ChangeType.revogacao_parcial:
    case ChangeType.revogacao_total:
      return sourceUnit?.identificacao?.trim()
        ? `Revogado pelo ${ref}`
        : `Revogado ${FEMININE_ACT_TYPES.has(alteradora.tipo) ? 'pela' : 'pelo'} ${ref}`;
    case ChangeType.renumeracao:
      return sourceUnit?.identificacao?.trim()
        ? `Renumeração pelo ${ref}`
        : `Renumeração ${FEMININE_ACT_TYPES.has(alteradora.tipo) ? 'pela' : 'pelo'} ${ref}`;
    default:
      return ref;
  }
}

export function formatExternalSourceLabel(source: {
  tipo?: ActType | null;
  numero?: string | null;
  ano?: number | null;
  emissor: string;
  descricao?: string | null;
}): string {
  const parts: string[] = [];
  if (source.tipo && source.numero && source.ano) {
    const n = Number(source.numero.replace(/\D/g, ''));
    if (Number.isFinite(n)) {
      parts.push(formatActCode(source.tipo, n, source.ano));
    } else {
      parts.push(`${source.tipo.replace(/_/g, ' ')} nº ${source.numero}/${source.ano}`);
    }
  } else if (source.descricao?.trim()) {
    parts.push(source.descricao.trim().slice(0, 120));
  }
  parts.push(source.emissor.trim());
  return parts.filter(Boolean).join(' — ');
}

export function generateExternalConsolidationNote(
  tipo: ChangeType,
  source: {
    tipo?: ActType | null;
    numero?: string | null;
    ano?: number | null;
    emissor: string;
    descricao: string;
    url?: string | null;
  },
): string {
  const label = formatExternalSourceLabel(source);
  switch (tipo) {
    case ChangeType.alteracao_redacao:
      return `Redação dada por ${label}`;
    case ChangeType.inclusao:
      return `Incluído por ${label}`;
    case ChangeType.revogacao_parcial:
    case ChangeType.revogacao_total:
      return `Revogado por ${label}`;
    case ChangeType.renumeracao:
      return `Renumeração por ${label}`;
    default:
      return label;
  }
}

export function buildInternalNoteLink(
  alteradora: ActRef,
  sourceUnit: SourceUnitRef | null | undefined,
  structuredTextAvailable: boolean,
): string | null {
  if (!alteradora.slug) return null;
  const base = actPublicPath(alteradora.slug);
  if (!structuredTextAvailable || !sourceUnit) return base;
  return `${base}#${unitAnchorId(sourceUnit)}`;
}

export function buildOutboundEffectLabel(
  tipo: ChangeType,
  targetUnitIdentificacao: string | null,
  alterada: ActRef,
): string {
  const codigo = formatActCode(alterada.tipo, alterada.numero, alterada.ano, {
    atoConjunto: alterada.atoConjunto,
    prefixo: alterada.prefixo,
  });
  const disp = targetUnitIdentificacao?.trim();
  const prep = actPreposition(alterada.tipo);
  switch (tipo) {
    case ChangeType.alteracao_redacao:
      return disp
        ? `Altera redação ${disp} ${prep} ${codigo}`
        : `Altera redação ${prep} ${codigo}`;
    case ChangeType.inclusao:
      return disp ? `Inclui dispositivo ${prep} ${codigo}` : `Inclui dispositivo ${prep} ${codigo}`;
    case ChangeType.revogacao_parcial:
    case ChangeType.revogacao_total:
      return disp ? `Revoga ${disp} ${prep} ${codigo}` : `Revoga dispositivo ${prep} ${codigo}`;
    case ChangeType.renumeracao:
      return disp ? `Renumera ${disp} ${prep} ${codigo}` : `Renumera dispositivo ${prep} ${codigo}`;
    default:
      return `Altera ${prep} ${codigo}`;
  }
}

export function structuredTextAvailable(etapaEditorial: EditorialStage | undefined): boolean {
  return (
    etapaEditorial !== EditorialStage.somente_arquivo_original &&
    etapaEditorial !== undefined
  );
}
