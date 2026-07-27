'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Form';
import {
  type DeleteImportBlockMode,
  type ImportStructureBlock,
  getImportBlockChildren,
  importBlockLabel,
  reparentOptionsForImportDelete,
} from '@/lib/import-structure';
import { UNIT_TYPE_LABELS } from '@/lib/unit-hierarchy';
import type { UnitType } from '@/lib/types';

export function DeleteImportBlockDialog({
  open,
  block,
  blocks,
  onClose,
  onConfirm,
}: {
  open: boolean;
  block: ImportStructureBlock | null;
  blocks: ImportStructureBlock[];
  onClose: () => void;
  onConfirm: (opts: {
    mode: DeleteImportBlockMode;
    newParentOrdemForChildren: number | null;
  }) => void;
}) {
  const children = useMemo(
    () => (block ? getImportBlockChildren(blocks, block.ordem) : []),
    [block, blocks],
  );
  const hasChildren = children.length > 0;

  const [mode, setMode] = useState<DeleteImportBlockMode>('cascade');
  const [newParentOrdem, setNewParentOrdem] = useState('');

  const parentOptions = useMemo(
    () => (block ? reparentOptionsForImportDelete(blocks, block.ordem) : []),
    [block, blocks],
  );

  useEffect(() => {
    if (!open || !block) return;
    setMode('cascade');
    const suggested =
      block.parentOrdem != null ? String(block.parentOrdem) : '';
    setNewParentOrdem(suggested);
  }, [open, block]);

  if (!open || !block) return null;

  const label = importBlockLabel(block);
  const typeLabel = UNIT_TYPE_LABELS[block.tipo as UnitType] ?? block.tipo;

  function handleConfirm() {
    onConfirm({
      mode: hasChildren ? mode : 'cascade',
      newParentOrdemForChildren:
        hasChildren && mode === 'reparent'
          ? newParentOrdem === ''
            ? null
            : Number(newParentOrdem)
          : null,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-import-block-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[14px] border border-line bg-surface p-5 shadow-xl">
        <h2 id="delete-import-block-title" className="text-[16px] font-semibold text-ink">
          Excluir elemento da conferência
        </h2>

        <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
          Remover <strong className="text-ink">{label}</strong>
          <span className="text-ink-3"> ({typeLabel})</span> da estrutura identificada?
        </p>
        <p className="mt-2 text-[12.5px] text-ink-3">
          A exclusão afeta apenas a estrutura provisória desta importação. O arquivo original não
          será alterado.
        </p>

        {hasChildren ? (
          <div className="mt-4 space-y-3 rounded-[10px] border border-warn/30 bg-warn/5 p-3">
            <div className="flex gap-2 text-[13px] text-ink-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
              <p>
                Este elemento possui <strong>{children.length}</strong> elemento
                {children.length === 1 ? '' : 's'} subordinado
                {children.length === 1 ? '' : 's'}. Escolha como proceder:
              </p>
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-[13px]">
              <input
                type="radio"
                name="import-delete-mode"
                className="mt-1"
                checked={mode === 'cascade'}
                onChange={() => setMode('cascade')}
              />
              <span>
                <strong>Excluir com toda a estrutura subordinada</strong>
                <span className="mt-0.5 block text-[12px] text-ink-3">
                  Remove o elemento e todos os filhos identificados.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-[13px]">
              <input
                type="radio"
                name="import-delete-mode"
                className="mt-1"
                checked={mode === 'reparent'}
                onChange={() => setMode('reparent')}
              />
              <span>
                <strong>Excluir apenas este elemento</strong>
                <span className="mt-0.5 block text-[12px] text-ink-3">
                  Os filhos permanecem e serão marcados para revisão de vínculo.
                </span>
              </span>
            </label>
            {mode === 'reparent' && (
              <div>
                <label className="mb-1 block text-[12px] font-medium text-ink-3">
                  Novo vínculo dos elementos filhos
                </label>
                <Select
                  value={newParentOrdem}
                  onChange={(e) => setNewParentOrdem(e.target.value)}
                  className="text-[13px]"
                >
                  <option value="">
                    Nenhum (nível superior)
                    {block.parentOrdem != null
                      ? (() => {
                          const suggested = blocks.find((b) => b.ordem === block.parentOrdem);
                          return suggested
                            ? ` — sugerido: [${block.parentOrdem}] ${importBlockLabel(suggested)}`
                            : '';
                        })()
                      : ''}
                  </option>
                  {parentOptions.map((p) => (
                    <option key={p.ordem} value={p.ordem}>
                      [{p.ordem}] {importBlockLabel(p)} (
                      {UNIT_TYPE_LABELS[p.tipo as UnitType] ?? p.tipo})
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <ul className="max-h-28 overflow-y-auto text-[12px] text-ink-3">
              {children.map((c) => (
                <li key={c.ordem}>
                  · {importBlockLabel(c)} ({UNIT_TYPE_LABELS[c.tipo as UnitType] ?? c.tipo})
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" size="sm" onClick={handleConfirm}>
            Confirmar exclusão
          </Button>
        </div>
      </div>
    </div>
  );
}
