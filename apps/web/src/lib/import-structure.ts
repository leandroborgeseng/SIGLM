import { UNIT_TYPE_LABELS } from '@/lib/unit-hierarchy';
import type { UnitType } from '@/lib/types';

export type ImportStructureBlock = {
  tag: string;
  tipo: string;
  texto: string;
  confianca: number;
  ordem: number;
  parentOrdem?: number | null;
  needsParentReview?: boolean;
  formatacao?: {
    align?: 'left' | 'center' | 'right' | 'justify';
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    letterSpacing?: 'normal' | 'expanded';
  } | null;
};

export type DeleteImportBlockMode = 'cascade' | 'reparent';

export function importBlockLabel(block: ImportStructureBlock): string {
  return (
    block.tag?.trim() ||
    UNIT_TYPE_LABELS[block.tipo as UnitType] ||
    block.tipo
  );
}

export function getImportBlockChildren(
  blocks: ImportStructureBlock[],
  parentOrdem: number,
): ImportStructureBlock[] {
  return blocks.filter((b) => b.parentOrdem === parentOrdem);
}

/** Coleta ordens de todos os descendentes (não inclui o próprio pai). */
export function collectDescendantOrdens(
  blocks: ImportStructureBlock[],
  rootOrdem: number,
): Set<number> {
  const result = new Set<number>();
  const queue = [rootOrdem];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const b of blocks) {
      if (b.parentOrdem === current && !result.has(b.ordem)) {
        result.add(b.ordem);
        queue.push(b.ordem);
      }
    }
  }
  return result;
}

/** Reindexa ordem sequencial e remapeia parentOrdem após remoções. */
export function reindexImportBlocks(
  blocks: ImportStructureBlock[],
): ImportStructureBlock[] {
  const oldToNew = new Map<number, number>();
  blocks.forEach((b, i) => oldToNew.set(b.ordem, i));
  return blocks.map((b, i) => ({
    ...b,
    ordem: i,
    parentOrdem:
      b.parentOrdem == null ? null : (oldToNew.get(b.parentOrdem) ?? null),
  }));
}

export function deleteImportBlock(
  blocks: ImportStructureBlock[],
  targetOrdem: number,
  mode: DeleteImportBlockMode,
  newParentOrdemForChildren: number | null = null,
): ImportStructureBlock[] {
  const target = blocks.find((b) => b.ordem === targetOrdem);
  if (!target) return blocks;

  const descendantOrdens = collectDescendantOrdens(blocks, targetOrdem);
  const ordensToRemove =
    mode === 'cascade'
      ? new Set([targetOrdem, ...descendantOrdens])
      : new Set([targetOrdem]);

  const fallbackParent = newParentOrdemForChildren ?? target.parentOrdem ?? null;

  const remaining = blocks
    .filter((b) => !ordensToRemove.has(b.ordem))
    .map((b) => {
      if (mode !== 'reparent' || b.parentOrdem !== targetOrdem) return b;
      return {
        ...b,
        parentOrdem: fallbackParent,
        needsParentReview: true,
      };
    });

  return reindexImportBlocks(remaining);
}

/** Pais candidatos para filhos ao excluir apenas o elemento (exclui alvo e descendentes). */
export function reparentOptionsForImportDelete(
  blocks: ImportStructureBlock[],
  targetOrdem: number,
): ImportStructureBlock[] {
  const exclude = new Set([targetOrdem, ...collectDescendantOrdens(blocks, targetOrdem)]);
  return blocks.filter((b) => !exclude.has(b.ordem));
}
