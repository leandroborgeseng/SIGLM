'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Form';
import { getParentOptions, parentLabel, UNIT_TYPE_LABELS } from '@/lib/unit-hierarchy';
import type { NormativeUnit } from '@/lib/types';

export type DeleteUnitMode = 'cascade' | 'reparent';

export function DeleteUnitDialog({
  open,
  unit,
  units,
  onClose,
  onConfirm,
  busy,
}: {
  open: boolean;
  unit: NormativeUnit | null;
  units: NormativeUnit[];
  onClose: () => void;
  onConfirm: (opts: {
    mode: DeleteUnitMode;
    newParentId?: string | null;
    confirmEffectCleanup?: boolean;
  }) => void | Promise<void>;
  busy?: boolean;
}) {
  const children = useMemo(
    () => (unit ? units.filter((u) => u.parentUnitId === unit.id) : []),
    [unit, units],
  );
  const hasChildren = children.length > 0;

  const [mode, setMode] = useState<DeleteUnitMode>('cascade');
  const [newParentId, setNewParentId] = useState('');
  const [confirmEffects, setConfirmEffects] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !unit) return;
    setMode(hasChildren ? 'cascade' : 'cascade');
    setNewParentId(unit.parentUnitId ?? '');
    setConfirmEffects(false);
    setError('');
  }, [open, unit, hasChildren]);

  if (!open || !unit) return null;

  const label =
    unit.identificacao?.trim() ||
    UNIT_TYPE_LABELS[unit.tipoUnidade] ||
    unit.tipoUnidade;

  const parentGroups = getParentOptions(unit.tipoUnidade, units, unit.id);
  const childIds = new Set(children.map((c) => c.id));
  const parentOptions = [...parentGroups.recommended, ...parentGroups.others].filter(
    (p) => !childIds.has(p.id),
  );

  async function handleConfirm() {
    setError('');
    try {
      await onConfirm({
        mode: hasChildren ? mode : 'cascade',
        newParentId:
          hasChildren && mode === 'reparent'
            ? newParentId || null
            : undefined,
        confirmEffectCleanup: confirmEffects || undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível excluir');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-unit-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[14px] border border-line bg-surface p-5 shadow-xl">
        <h2 id="delete-unit-title" className="text-[16px] font-semibold text-ink">
          Excluir elemento
        </h2>

        <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
          Remover <strong className="text-ink">{label}</strong>
          {unit.identificacao ? (
            <span className="text-ink-3"> ({UNIT_TYPE_LABELS[unit.tipoUnidade]})</span>
          ) : null}
          ?
        </p>
        <p className="mt-2 text-[12.5px] text-ink-3">
          Exclusão administrativa da versão de trabalho — não gera revogação legislativa nem
          aparece no histórico público. Versões anteriores e publicadas permanecem intactas.
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
                name="delete-mode"
                className="mt-1"
                checked={mode === 'cascade'}
                onChange={() => setMode('cascade')}
              />
              <span>
                <strong>Excluir com toda a estrutura subordinada</strong>
                <span className="mt-0.5 block text-[12px] text-ink-3">
                  Opção padrão / mais segura — remove o elemento e todos os filhos.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-[13px]">
              <input
                type="radio"
                name="delete-mode"
                className="mt-1"
                checked={mode === 'reparent'}
                onChange={() => setMode('reparent')}
              />
              <span>
                <strong>Excluir apenas este elemento</strong>
                <span className="mt-0.5 block text-[12px] text-ink-3">
                  Os filhos serão revinculados ao pai indicado (ou ficarão na raiz).
                </span>
              </span>
            </label>
            {mode === 'reparent' && (
              <div>
                <label className="mb-1 block text-[12px] font-medium text-ink-3">
                  Novo vínculo dos elementos filhos
                </label>
                <Select
                  value={newParentId}
                  onChange={(e) => setNewParentId(e.target.value)}
                  className="text-[13px]"
                >
                  <option value="">
                    Raiz
                    {unit.parentUnitId
                      ? ` (sugerido: ${parentLabel(units, unit.parentUnitId)})`
                      : ''}
                  </option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.identificacao ?? UNIT_TYPE_LABELS[p.tipoUnidade]}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {children.length > 0 && (
              <ul className="max-h-28 overflow-y-auto text-[12px] text-ink-3">
                {children.map((c) => (
                  <li key={c.id}>
                    · {c.identificacao ?? UNIT_TYPE_LABELS[c.tipoUnidade]}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        <label className="mt-4 flex cursor-pointer items-start gap-2 text-[12.5px] text-ink-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={confirmEffects}
            onChange={(e) => setConfirmEffects(e.target.checked)}
          />
          <span>
            Se houver efeitos legislativos referenciando este elemento, autorizo limpar esses
            vínculos (target/referência/redação). Efeitos em que o elemento é origem continuam
            bloqueando a exclusão.
          </span>
        </label>

        {error ? (
          <p className="mt-3 rounded-[8px] border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="danger" size="sm" onClick={() => void handleConfirm()} disabled={busy}>
            {busy ? 'Excluindo…' : 'Confirmar exclusão'}
          </Button>
        </div>
      </div>
    </div>
  );
}
