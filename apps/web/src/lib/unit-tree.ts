import type { UnitType } from '@/lib/types';
import { UNIT_TYPE_LABELS } from '@/lib/unit-hierarchy';

export interface TreeUnit {
  id: string;
  identificacao: string | null;
  tipoUnidade: UnitType | string;
  ordem: number;
  parentUnitId?: string | null;
}

export interface UnitTreeNode {
  unit: TreeUnit;
  children: UnitTreeNode[];
  depth: number;
}

/** Monta árvore a partir de lista plana ordenada por `ordem`. */
export function buildUnitTree(units: TreeUnit[]): UnitTreeNode[] {
  const sorted = [...units].sort((a, b) => a.ordem - b.ordem);
  const byId = new Map(sorted.map((u) => [u.id, u]));
  const childMap = new Map<string | null, TreeUnit[]>();

  for (const u of sorted) {
    const parentId =
      u.parentUnitId && byId.has(u.parentUnitId) ? u.parentUnitId : null;
    const list = childMap.get(parentId) ?? [];
    list.push(u);
    childMap.set(parentId, list);
  }

  const build = (parentId: string | null, depth: number): UnitTreeNode[] =>
    (childMap.get(parentId) ?? []).map((unit) => ({
      unit,
      depth,
      children: build(unit.id, depth + 1),
    }));

  return build(null, 0);
}

export function unitTreeLabel(unit: TreeUnit): string {
  const label = unit.identificacao?.trim();
  if (label) return label;
  const tipo = unit.tipoUnidade as UnitType;
  return UNIT_TYPE_LABELS[tipo] ?? String(unit.tipoUnidade);
}
