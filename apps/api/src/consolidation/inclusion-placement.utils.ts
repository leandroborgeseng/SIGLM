import { InclusaoPosicionamento } from '@prisma/client';

export interface UnitPlacementRow {
  id: string;
  ordem: number;
  parentUnitId: string | null;
}

export function collectSubtreeIds(
  rootId: string,
  units: UnitPlacementRow[],
): Set<string> {
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

/** Calcula ordem e pai para inserir unidade na norma alterada. */
export function computeInclusionPlacement(
  units: UnitPlacementRow[],
  referenciaUnitId: string,
  posicionamento: InclusaoPosicionamento,
): { insertOrdem: number; parentUnitId: string | null } {
  const sorted = [...units].sort((a, b) => a.ordem - b.ordem);
  const ref = sorted.find((u) => u.id === referenciaUnitId);
  if (!ref) {
    throw new Error('Dispositivo de referência não encontrado');
  }

  if (posicionamento === 'dentro_de') {
    const subtree = collectSubtreeIds(referenciaUnitId, sorted);
    const maxOrdem = Math.max(
      ...sorted.filter((u) => subtree.has(u.id)).map((u) => u.ordem),
    );
    return { insertOrdem: maxOrdem + 1, parentUnitId: referenciaUnitId };
  }

  if (posicionamento === 'antes_de') {
    return { insertOrdem: ref.ordem, parentUnitId: ref.parentUnitId };
  }

  const subtree = collectSubtreeIds(referenciaUnitId, sorted);
  const maxOrdem = Math.max(
    ...sorted.filter((u) => subtree.has(u.id)).map((u) => u.ordem),
  );
  return { insertOrdem: maxOrdem + 1, parentUnitId: ref.parentUnitId };
}

/** Desloca ordens >= insertOrdem em +1 (para abrir slot). */
export function shiftOrdersFrom(
  units: UnitPlacementRow[],
  insertOrdem: number,
): UnitPlacementRow[] {
  return units.map((u) =>
    u.ordem >= insertOrdem ? { ...u, ordem: u.ordem + 1 } : u,
  );
}
