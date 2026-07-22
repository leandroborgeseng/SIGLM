import { UnitType } from '@prisma/client';

/** Elementos de organização estrutural (LC 95/98). */
export const DIVISION_TYPES: UnitType[] = [
  UnitType.parte,
  UnitType.livro,
  UnitType.titulo,
  UnitType.subtitulo,
  UnitType.capitulo,
  UnitType.subcapitulo,
  UnitType.secao,
  UnitType.subsecao,
  UnitType.anexo,
];

/** Dispositivos normativos. */
export const HIERARCHY_TYPES: UnitType[] = [
  UnitType.artigo,
  UnitType.paragrafo_unico,
  UnitType.paragrafo,
  UnitType.inciso,
  UnitType.alinea,
  UnitType.item,
];

export const DIVISION_ORDER = [...DIVISION_TYPES];
export const HIERARCHY_ORDER = [...HIERARCHY_TYPES];

const STRUCTURAL_PARENTS: UnitType[] = [
  UnitType.parte,
  UnitType.livro,
  UnitType.titulo,
  UnitType.subtitulo,
  UnitType.capitulo,
  UnitType.subcapitulo,
  UnitType.secao,
  UnitType.subsecao,
  UnitType.anexo,
];

/** Hierarquia usual (sugestão). Não bloqueia vínculos atípicos. */
export const RECOMMENDED_PARENTS: Partial<Record<UnitType, UnitType[]>> = {
  [UnitType.parte]: [],
  [UnitType.livro]: [UnitType.parte],
  [UnitType.titulo]: [UnitType.parte, UnitType.livro],
  [UnitType.subtitulo]: [UnitType.titulo],
  [UnitType.capitulo]: [UnitType.parte, UnitType.livro, UnitType.titulo, UnitType.subtitulo],
  [UnitType.subcapitulo]: [UnitType.capitulo],
  [UnitType.secao]: [UnitType.capitulo, UnitType.subcapitulo, UnitType.titulo],
  [UnitType.subsecao]: [UnitType.secao],
  [UnitType.anexo]: STRUCTURAL_PARENTS,
  [UnitType.artigo]: STRUCTURAL_PARENTS,
  [UnitType.paragrafo_unico]: [UnitType.artigo],
  [UnitType.paragrafo]: [UnitType.artigo],
  [UnitType.inciso]: [UnitType.artigo, UnitType.paragrafo, UnitType.paragrafo_unico],
  [UnitType.alinea]: [UnitType.inciso],
  [UnitType.item]: [UnitType.alinea, UnitType.inciso],
};

export function isRecommendedParent(childType: UnitType, parentType: UnitType): boolean {
  if (
    childType === UnitType.texto_simples ||
    childType === UnitType.preambulo ||
    childType === UnitType.ementa ||
    childType === UnitType.considerando
  ) {
    return false;
  }
  const allowed = RECOMMENDED_PARENTS[childType];
  if (!allowed) return true;
  if (allowed.length === 0) return false;
  return allowed.includes(parentType);
}

/** @deprecated Prefer isRecommendedParent — não bloqueia vínculos. */
export function isValidParent(childType: UnitType, parentType: UnitType): boolean {
  return isRecommendedParent(childType, parentType);
}

/**
 * Valida apenas integridade estrutural (órfãos, ciclos, ordem).
 * Vínculos fora do padrão usual NÃO invalidam.
 */
export function validateUnitsHierarchy(
  units: { id: string; ordem: number; tipoUnidade: UnitType; parentUnitId?: string | null }[],
): boolean {
  if (units.length === 0) return true;

  const sorted = [...units].sort((a, b) => a.ordem - b.ordem);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].ordem !== i) return false;
  }

  const byId = new Map(sorted.map((u) => [u.id, u]));

  for (const unit of sorted) {
    if (!unit.parentUnitId) continue;
    if (unit.parentUnitId === unit.id) return false;
    const parent = byId.get(unit.parentUnitId);
    if (!parent) return false;
    if (parent.ordem >= unit.ordem) return false;

    let cur: string | null | undefined = parent.parentUnitId;
    const seen = new Set<string>([unit.id, parent.id]);
    while (cur) {
      if (seen.has(cur)) return false;
      seen.add(cur);
      cur = byId.get(cur)?.parentUnitId;
    }
  }
  return true;
}

export function defaultIdentificacao(
  tipo: UnitType,
  units: { tipoUnidade: UnitType; parentUnitId?: string | null; identificacao?: string | null }[],
  parentUnitId?: string | null,
): string | undefined {
  const siblings = (t: UnitType) =>
    units.filter((u) => u.tipoUnidade === t && (u.parentUnitId ?? null) === (parentUnitId ?? null));

  switch (tipo) {
    case UnitType.artigo:
      return `Art. ${units.filter((u) => u.tipoUnidade === UnitType.artigo).length + 1}º`;
    case UnitType.paragrafo_unico:
      return 'Parágrafo único';
    case UnitType.paragrafo:
      return `§ ${siblings(UnitType.paragrafo).length + 1}º`;
    case UnitType.inciso: {
      const n = siblings(UnitType.inciso).length + 1;
      const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
      return romans[n - 1] ?? String(n);
    }
    case UnitType.alinea: {
      const n = siblings(UnitType.alinea).length;
      return `${String.fromCharCode(97 + n)})`;
    }
    case UnitType.item:
      return `${siblings(UnitType.item).length + 1}.`;
    case UnitType.parte:
      return `PARTE ${units.filter((u) => u.tipoUnidade === UnitType.parte).length + 1}`;
    case UnitType.livro:
      return `LIVRO ${units.filter((u) => u.tipoUnidade === UnitType.livro).length + 1}`;
    case UnitType.titulo:
      return `TÍTULO ${units.filter((u) => u.tipoUnidade === UnitType.titulo).length + 1}`;
    case UnitType.subtitulo:
      return `SUBTÍTULO ${siblings(UnitType.subtitulo).length + 1}`;
    case UnitType.capitulo:
      return `CAPÍTULO ${units.filter((u) => u.tipoUnidade === UnitType.capitulo).length + 1}`;
    case UnitType.subcapitulo:
      return `SUBCAPÍTULO ${siblings(UnitType.subcapitulo).length + 1}`;
    case UnitType.secao:
      return `SEÇÃO ${units.filter((u) => u.tipoUnidade === UnitType.secao).length + 1}`;
    case UnitType.subsecao:
      return `SUBSEÇÃO ${siblings(UnitType.subsecao).length + 1}`;
    case UnitType.anexo:
      return `ANEXO ${units.filter((u) => u.tipoUnidade === UnitType.anexo).length + 1}`;
    case UnitType.considerando:
    case UnitType.preambulo:
      return 'Preâmbulo';
    case UnitType.ementa:
      return 'Ementa';
    case UnitType.texto_simples:
      return undefined;
    default:
      return undefined;
  }
}

export function isStructuralType(tipo: UnitType): boolean {
  return DIVISION_TYPES.includes(tipo);
}

export function isDeviceType(tipo: UnitType): boolean {
  return HIERARCHY_TYPES.includes(tipo);
}
