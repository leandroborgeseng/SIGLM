import type { NormativeUnit, UnitType } from '@/lib/types';

export const DIVISION_TYPES: UnitType[] = ['titulo', 'capitulo', 'secao', 'subsecao'];

export const HIERARCHY_TYPES: UnitType[] = ['artigo', 'paragrafo', 'inciso', 'alinea', 'item'];

export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  titulo: 'Título',
  livro: 'Livro',
  capitulo: 'Capítulo',
  secao: 'Seção',
  subsecao: 'Subseção',
  artigo: 'Artigo',
  paragrafo: 'Parágrafo',
  inciso: 'Inciso',
  alinea: 'Alínea',
  item: 'Item',
  anexo: 'Anexo',
  preambulo: 'Preâmbulo',
  ementa: 'Ementa',
};

const VALID_PARENTS: Partial<Record<UnitType, UnitType[]>> = {
  titulo: [],
  capitulo: ['titulo'],
  secao: ['capitulo', 'titulo'],
  subsecao: ['secao', 'capitulo'],
  artigo: ['titulo', 'capitulo', 'secao', 'subsecao'],
  paragrafo: ['artigo', 'paragrafo'],
  inciso: ['artigo', 'paragrafo'],
  alinea: ['inciso'],
  item: ['alinea', 'inciso'],
};

export function isValidParent(childType: UnitType, parentType: UnitType): boolean {
  const allowed = VALID_PARENTS[childType];
  if (!allowed) return true;
  return allowed.includes(parentType);
}

export function validateUnitsHierarchy(units: NormativeUnit[]): boolean {
  if (units.length === 0) return true;
  const sorted = [...units].sort((a, b) => a.ordem - b.ordem);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].ordem !== i) return false;
  }
  const byId = new Map(sorted.map((u) => [u.id, u]));
  for (const unit of sorted) {
    if (!unit.parentUnitId) continue;
    const parent = byId.get(unit.parentUnitId);
    if (!parent) return false;
    if (!isValidParent(unit.tipoUnidade, parent.tipoUnidade)) return false;
    if (parent.ordem >= unit.ordem) return false;
  }
  return true;
}

export function unitIndentClass(tipo: UnitType): string {
  switch (tipo) {
    case 'titulo':
    case 'capitulo':
    case 'secao':
    case 'subsecao':
      return 'ml-0';
    case 'artigo':
      return 'ml-0';
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
    const removedBefore = units.slice(fromIndex + 1, toIndex + 1).filter((u) => blockIds.has(u.id)).length;
    insertAt = toIndex - block.length + 1 - removedBefore;
  }

  insertAt = Math.max(0, Math.min(insertAt, rest.length));
  const next = [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
  return next.map((u, i) => ({ ...u, ordem: i }));
}

export function getValidParents(
  tipo: UnitType,
  units: NormativeUnit[],
): NormativeUnit[] {
  const allowed = VALID_PARENTS[tipo];
  if (!allowed) return [];
  if (allowed.length === 0) return [];
  return units.filter((u) => allowed.includes(u.tipoUnidade));
}

export function parentLabel(units: NormativeUnit[], parentUnitId: string | null | undefined): string {
  if (!parentUnitId) return '—';
  const parent = units.find((u) => u.id === parentUnitId);
  if (!parent) return '—';
  return parent.identificacao ?? UNIT_TYPE_LABELS[parent.tipoUnidade];
}
