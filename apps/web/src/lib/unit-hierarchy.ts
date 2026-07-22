import type { NormativeUnit, UnitType } from '@/lib/types';

export const DIVISION_TYPES: UnitType[] = [
  'parte',
  'livro',
  'titulo',
  'subtitulo',
  'capitulo',
  'subcapitulo',
  'secao',
  'subsecao',
  'anexo',
];

export const HIERARCHY_TYPES: UnitType[] = [
  'artigo',
  'paragrafo_unico',
  'paragrafo',
  'inciso',
  'alinea',
  'item',
];

/** Tipos do grupo “Texto” no Editor de Texto Estruturado. */
export const TEXT_GROUP_TYPES: UnitType[] = ['ementa', 'preambulo', 'texto_simples'];

/** Tipos válidos para inclusão via efeito legislativo (dispositivos + divisões). */
export const INCLUSION_UNIT_TYPES: UnitType[] = [...DIVISION_TYPES, ...HIERARCHY_TYPES];

/** Tipos que não produzem efeitos legislativos sobre outras normas. */
export const NON_EFFECT_SOURCE_TYPES: UnitType[] = [
  'texto_simples',
  'ementa',
  'preambulo',
  'considerando',
];

export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  parte: 'Parte',
  livro: 'Livro',
  titulo: 'Título',
  subtitulo: 'Subtítulo',
  capitulo: 'Capítulo',
  subcapitulo: 'Subcapítulo',
  secao: 'Seção',
  subsecao: 'Subseção',
  artigo: 'Artigo (caput)',
  paragrafo_unico: 'Parágrafo único',
  paragrafo: 'Parágrafo',
  inciso: 'Inciso',
  alinea: 'Alínea',
  item: 'Item',
  anexo: 'Anexo',
  preambulo: 'Preâmbulo',
  considerando: 'Considerando',
  ementa: 'Ementa',
  texto_simples: 'Texto simples',
};

const STRUCTURAL_PARENTS: UnitType[] = [...DIVISION_TYPES];

/** Hierarquia usual (sugestão) — nunca usada como trava. */
export const RECOMMENDED_PARENTS: Partial<Record<UnitType, UnitType[]>> = {
  parte: [],
  livro: ['parte'],
  titulo: ['parte', 'livro'],
  subtitulo: ['titulo'],
  capitulo: ['parte', 'livro', 'titulo', 'subtitulo'],
  subcapitulo: ['capitulo'],
  secao: ['capitulo', 'subcapitulo', 'titulo'],
  subsecao: ['secao'],
  anexo: STRUCTURAL_PARENTS,
  artigo: STRUCTURAL_PARENTS,
  paragrafo_unico: ['artigo'],
  paragrafo: ['artigo'],
  inciso: ['artigo', 'paragrafo', 'paragrafo_unico'],
  alinea: ['inciso'],
  item: ['alinea', 'inciso'],
};

export function isStructuralType(tipo: UnitType): boolean {
  return DIVISION_TYPES.includes(tipo);
}

export function isTextGroupType(tipo: UnitType): boolean {
  return TEXT_GROUP_TYPES.includes(tipo) || tipo === 'considerando';
}

/** Tipos normalmente recomendados como filhos de um elemento. */
export function recommendedChildTypes(parentType: UnitType): UnitType[] {
  const result: UnitType[] = [];
  for (const [child, parents] of Object.entries(RECOMMENDED_PARENTS) as [UnitType, UnitType[]][]) {
    if (parents.includes(parentType)) result.push(child);
  }
  return result;
}

export function isRecommendedParent(childType: UnitType, parentType: UnitType): boolean {
  if (isTextGroupType(childType)) return false;
  const allowed = RECOMMENDED_PARENTS[childType];
  if (!allowed) return true;
  if (allowed.length === 0) return false;
  return allowed.includes(parentType);
}

/**
 * Aceita qualquer vínculo explícito (normas antigas / estruturas atípicas).
 * Apenas rejeita auto-referência implícita tratada em outro lugar.
 */
export function isAllowedParent(
  _childType: UnitType,
  _parentType: UnitType | null | undefined,
): boolean {
  return true;
}

/** @deprecated Prefer isRecommendedParent; mantido onde a API ainda importa o nome. */
export function isValidParent(childType: UnitType, parentType: UnitType): boolean {
  return isRecommendedParent(childType, parentType);
}

export function hasEmentaUnit(units: NormativeUnit[]): boolean {
  return units.some((u) => u.tipoUnidade === 'ementa');
}

export function resolveActEmenta(units: NormativeUnit[], fallback = ''): string {
  const unit = units.find((u) => u.tipoUnidade === 'ementa');
  const text = unit?.texto?.replace(/<[^>]+>/g, '').trim();
  return text || fallback;
}

export type HierarchyAssessment = {
  /** Estrutura íntegra (sem órfãos / ciclos / ordem invertida). */
  structurallySound: boolean;
  /** Há vínculos fora do padrão usual (apenas aviso). */
  hasNonstandardLinks: boolean;
  warnings: string[];
};

export function assessUnitsHierarchy(units: NormativeUnit[]): HierarchyAssessment {
  const warnings: string[] = [];
  if (units.length === 0) {
    return { structurallySound: true, hasNonstandardLinks: false, warnings };
  }

  const sorted = [...units].sort((a, b) => a.ordem - b.ordem);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].ordem !== i) {
      return {
        structurallySound: false,
        hasNonstandardLinks: false,
        warnings: ['A ordem dos elementos está inconsistente.'],
      };
    }
  }

  const byId = new Map(sorted.map((u) => [u.id, u]));
  let hasNonstandardLinks = false;

  for (const unit of sorted) {
    if (!unit.parentUnitId) continue;
    if (unit.parentUnitId === unit.id) {
      return {
        structurallySound: false,
        hasNonstandardLinks: false,
        warnings: ['Um elemento não pode ser pai de si mesmo.'],
      };
    }
    const parent = byId.get(unit.parentUnitId);
    if (!parent) {
      return {
        structurallySound: false,
        hasNonstandardLinks: false,
        warnings: ['Há vínculos para elementos inexistentes.'],
      };
    }
    if (parent.ordem >= unit.ordem) {
      return {
        structurallySound: false,
        hasNonstandardLinks: false,
        warnings: ['Um elemento pai deve aparecer antes do filho na ordem.'],
      };
    }
    // ciclo simples
    let cur: string | null | undefined = parent.parentUnitId;
    const seen = new Set<string>([unit.id, parent.id]);
    while (cur) {
      if (seen.has(cur)) {
        return {
          structurallySound: false,
          hasNonstandardLinks: false,
          warnings: ['Há um ciclo na hierarquia.'],
        };
      }
      seen.add(cur);
      cur = byId.get(cur)?.parentUnitId;
    }

    if (!isRecommendedParent(unit.tipoUnidade, parent.tipoUnidade)) {
      hasNonstandardLinks = true;
    }
  }

  if (hasNonstandardLinks) {
    warnings.push(
      'Há vínculos fora do padrão legislativo usual. Isso é permitido para reproduzir atos publicados fielmente.',
    );
  }

  return { structurallySound: true, hasNonstandardLinks, warnings };
}

/** Compat: true se a estrutura for íntegra (vínculos atípicos NÃO invalidam). */
export function validateUnitsHierarchy(units: NormativeUnit[]): boolean {
  return assessUnitsHierarchy(units).structurallySound;
}

export function unitParentDepth(unit: NormativeUnit, units: NormativeUnit[]): number {
  let depth = 0;
  let current = unit.parentUnitId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    depth++;
    current = units.find((u) => u.id === current)?.parentUnitId ?? null;
  }
  return depth;
}

/** Recuo visual baseado no vínculo pai → filho (não só no tipo). */
export function unitIndentPx(unit: NormativeUnit, units: NormativeUnit[]): number {
  return Math.min(unitParentDepth(unit, units), 12) * 16;
}

/** @deprecated Prefer unitIndentPx — mantido para a consulta pública. */
export function unitIndentClass(tipo: UnitType): string {
  if (isStructuralType(tipo)) return 'ml-0';
  switch (tipo) {
    case 'artigo':
      return 'ml-0';
    case 'paragrafo_unico':
    case 'paragrafo':
      return 'ml-4';
    case 'inciso':
      return 'ml-8';
    case 'alinea':
      return 'ml-12';
    case 'item':
      return 'ml-16';
    default:
      return 'ml-0';
  }
}

export function collectSubtreeIds(rootId: string, units: NormativeUnit[]): Set<string> {
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const u of units) {
      if (u.parentUnitId && ids.has(u.parentUnitId) && !ids.has(u.id)) {
        ids.add(u.id);
        changed = true;
      }
    }
  }
  return ids;
}

export function hasChildren(unitId: string, units: NormativeUnit[]): boolean {
  return units.some((u) => u.parentUnitId === unitId);
}

export function isCollapsedAway(
  unit: NormativeUnit,
  units: NormativeUnit[],
  collapsed: Set<string>,
): boolean {
  let current = unit.parentUnitId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    if (collapsed.has(current)) return true;
    seen.add(current);
    current = units.find((u) => u.id === current)?.parentUnitId ?? null;
  }
  return false;
}

export function moveUnitBlock(
  units: NormativeUnit[],
  fromIndex: number,
  direction: -1 | 1,
): NormativeUnit[] {
  const targetIndex = fromIndex + direction;
  if (targetIndex < 0 || targetIndex >= units.length) return units;

  const root = units[fromIndex];
  const blockIds = collectSubtreeIds(root.id, units);
  const block = units.filter((u) => blockIds.has(u.id));
  const rest = units.filter((u) => !blockIds.has(u.id));

  let insertAt = targetIndex;
  if (direction === 1) {
    const target = units[targetIndex];
    const targetBlockIds = collectSubtreeIds(target.id, units);
    insertAt = rest.findIndex((u) => u.id === target.id);
    if (insertAt < 0) insertAt = rest.length;
    const targetBlock = rest.filter((u) => targetBlockIds.has(u.id));
    insertAt += targetBlock.length;
  } else {
    insertAt = rest.findIndex((u) => u.id === units[targetIndex].id);
    if (insertAt < 0) insertAt = 0;
  }

  const next = [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
  return next.map((u, i) => ({ ...u, ordem: i }));
}

export function dragDropBlock(
  units: NormativeUnit[],
  fromIndex: number,
  toIndex: number,
): NormativeUnit[] {
  if (fromIndex === toIndex) return units;
  const root = units[fromIndex];
  const blockIds = collectSubtreeIds(root.id, units);
  const block = units.filter((u) => blockIds.has(u.id));
  const rest = units.filter((u) => !blockIds.has(u.id));

  let insertAt = toIndex;
  if (toIndex > fromIndex) {
    const removedBefore = units
      .slice(fromIndex + 1, toIndex + 1)
      .filter((u) => blockIds.has(u.id)).length;
    insertAt = toIndex - block.length + 1 - removedBefore;
  }

  insertAt = Math.max(0, Math.min(insertAt, rest.length));
  const next = [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
  return next.map((u, i) => ({ ...u, ordem: i }));
}

export type AddContext = {
  /** Elemento de referência (adicionar dentro ou após). */
  anchorId?: string | null;
  mode: 'end' | 'inside' | 'after';
};

/**
 * Sugere o pai mais provável com base no tipo, âncora e elementos próximos.
 * Apenas facilitador — o usuário pode alterar.
 */
export function suggestParentId(
  tipo: UnitType,
  units: NormativeUnit[],
  context: AddContext = { mode: 'end' },
): string | null {
  if (isTextGroupType(tipo)) return null;

  const recommended = RECOMMENDED_PARENTS[tipo] ?? [];
  const sorted = [...units].sort((a, b) => a.ordem - b.ordem);
  const anchor = context.anchorId
    ? sorted.find((u) => u.id === context.anchorId)
    : undefined;

  if (context.mode === 'inside' && anchor) {
    return anchor.id;
  }

  if (context.mode === 'after' && anchor) {
    if (recommended.includes(anchor.tipoUnidade)) return anchor.id;
    // Sobe a cadeia até achar tipo recomendado
    let cur: NormativeUnit | undefined = anchor;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (recommended.includes(cur.tipoUnidade)) return cur.id;
      cur = cur.parentUnitId
        ? sorted.find((u) => u.id === cur!.parentUnitId)
        : undefined;
    }
    // Mantém o mesmo pai do âncora (irmão)
    return anchor.parentUnitId ?? null;
  }

  // Inserção ao final: busca o candidato mais recente do tipo recomendado
  if (recommended.length === 0) return null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (recommended.includes(sorted[i].tipoUnidade)) return sorted[i].id;
  }
  return null;
}

/** Tipos sugeridos ao adicionar dentro de um elemento. */
export function suggestTypesForContext(context: AddContext, units: NormativeUnit[]): UnitType[] {
  if (context.mode === 'inside' && context.anchorId) {
    const anchor = units.find((u) => u.id === context.anchorId);
    if (anchor) {
      const children = recommendedChildTypes(anchor.tipoUnidade);
      if (children.length) return children;
    }
  }
  if (context.mode === 'after' && context.anchorId) {
    const anchor = units.find((u) => u.id === context.anchorId);
    if (anchor) {
      // Sugere irmãos do mesmo tipo ou filhos do pai
      return [anchor.tipoUnidade, ...recommendedChildTypes(anchor.tipoUnidade)];
    }
  }
  return ['artigo'];
}

export type ParentOptionGroups = {
  recommended: NormativeUnit[];
  others: NormativeUnit[];
};

/** Lista de pais possíveis: recomendados primeiro; demais disponíveis. */
export function getParentOptions(
  tipo: UnitType,
  units: NormativeUnit[],
  excludeId?: string,
): ParentOptionGroups {
  if (isTextGroupType(tipo)) return { recommended: [], others: [] };
  const candidates = units.filter((u) => u.id !== excludeId);
  const recommendedTypes = RECOMMENDED_PARENTS[tipo] ?? [];
  const recommended = candidates.filter((u) => recommendedTypes.includes(u.tipoUnidade));
  const others = candidates.filter((u) => !recommendedTypes.includes(u.tipoUnidade));
  return { recommended, others };
}

/** @deprecated Prefer getParentOptions. */
export function getValidParents(tipo: UnitType, units: NormativeUnit[]): NormativeUnit[] {
  return getParentOptions(tipo, units).recommended;
}

export function parentLabel(units: NormativeUnit[], parentUnitId: string | null | undefined): string {
  if (!parentUnitId) return '—';
  const parent = units.find((u) => u.id === parentUnitId);
  if (!parent) return '—';
  return parent.identificacao ?? UNIT_TYPE_LABELS[parent.tipoUnidade];
}

/** Rótulo indentado para seleção em árvore (efeitos legislativos, consolidação). */
export function unitTreeLabel(unit: NormativeUnit, units: NormativeUnit[]): string {
  const depth = unitParentDepth(unit, units);
  const pad = '  '.repeat(depth);
  const id = unit.identificacao ?? UNIT_TYPE_LABELS[unit.tipoUnidade];
  return `${pad}${id} (${UNIT_TYPE_LABELS[unit.tipoUnidade]})`;
}
