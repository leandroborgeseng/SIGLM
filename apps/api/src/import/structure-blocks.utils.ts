import { parseLegislativeEffects, type SuggestedLegislativeEffect } from './effects.parser';
import type { DetectedStructure, StructureBlock } from './structure.parser';

type BlockInput = Pick<StructureBlock, 'tag' | 'tipo' | 'texto' | 'ordem'> & {
  parentOrdem?: number | null;
  formatacao?: StructureBlock['formatacao'];
  confianca?: number;
};

const DEVICE_TYPES = new Set([
  'artigo',
  'paragrafo_unico',
  'paragrafo',
  'inciso',
  'alinea',
  'item',
  'titulo',
  'subtitulo',
  'capitulo',
  'subcapitulo',
  'secao',
  'subsecao',
  'parte',
  'livro',
  'anexo',
]);

export function identificacaoFromBlock(block: BlockInput): string | null {
  if (DEVICE_TYPES.has(block.tipo)) return block.tag;
  if (block.tipo === 'preambulo') return 'Preâmbulo';
  if (block.tipo === 'ementa') return 'Ementa';
  return null;
}

export function enrichStructureWithEffects(
  estrutura: DetectedStructure,
): DetectedStructure & { efeitosSugeridos: SuggestedLegislativeEffect[] } {
  return { ...estrutura, efeitosSugeridos: parseLegislativeEffects(estrutura.blocos) };
}

export interface PrepareBlocksResult {
  unitBlocks: BlockInput[];
  /** Texto da ementa detectada descartada (unidade existente preservada). */
  skippedEmentaText?: string;
}

/** Normaliza blocos detectados para persistência como unidades normativas. */
export function prepareUnitBlocksFromStructure(
  blocos: BlockInput[],
  opts?: {
    fallbackEmenta?: string | null;
    skipDetectedEmenta?: boolean;
  },
): PrepareBlocksResult {
  let rawBlocks: BlockInput[] = [...blocos];
  let skippedEmentaText: string | undefined;

  if (opts?.skipDetectedEmenta) {
    const ementaBlocks = rawBlocks.filter((b) => b.tipo === 'ementa');
    if (ementaBlocks.length) {
      skippedEmentaText = ementaBlocks.map((b) => b.texto).join(' ').trim();
      rawBlocks = rawBlocks.filter((b) => b.tipo !== 'ementa');
    }
  }

  if (
    !opts?.skipDetectedEmenta &&
    !rawBlocks.some((b) => b.tipo === 'ementa') &&
    opts?.fallbackEmenta?.trim()
  ) {
    rawBlocks = [
      {
        tag: 'Ementa',
        tipo: 'ementa',
        texto: opts.fallbackEmenta.trim(),
        ordem: -1,
        parentOrdem: null,
        confianca: 95,
      },
      ...rawBlocks,
    ];
  }

  rawBlocks = rawBlocks.map((b) =>
    b.tipo === 'considerando' ? { ...b, tipo: 'preambulo', tag: 'Preâmbulo' } : b,
  );

  const merged: BlockInput[] = [];
  const oldOrdemToNew = new Map<number, number>();
  for (const b of rawBlocks) {
    const last = merged[merged.length - 1];
    if (b.tipo === 'preambulo' && last?.tipo === 'preambulo') {
      last.texto = `${last.texto}\n\n${b.texto}`;
      oldOrdemToNew.set(b.ordem, merged.length - 1);
      continue;
    }
    if (b.tipo === 'ementa' && last?.tipo === 'ementa') {
      last.texto = `${last.texto} ${b.texto}`.trim();
      oldOrdemToNew.set(b.ordem, merged.length - 1);
      continue;
    }
    oldOrdemToNew.set(b.ordem, merged.length);
    merged.push({ ...b, ordem: merged.length });
  }

  const unitBlocks = merged.map((b) => ({
    ...b,
    parentOrdem:
      b.parentOrdem == null ? null : (oldOrdemToNew.get(b.parentOrdem) ?? null),
  }));

  return { unitBlocks, skippedEmentaText };
}
