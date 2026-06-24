'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import {
  DIVISION_TYPES,
  getValidParents,
  HIERARCHY_TYPES,
  isStructuralType,
  UNIT_TYPE_LABELS,
} from '@/lib/unit-hierarchy';
import type { NormativeUnit, UnitType } from '@/lib/types';

type Category = 'dispositivos' | 'divisoes';

export function AddUnitDialog({
  open,
  units,
  onClose,
  onConfirm,
}: {
  open: boolean;
  units: NormativeUnit[];
  onClose: () => void;
  onConfirm: (payload: {
    tipoUnidade: UnitType;
    identificacao?: string;
    texto?: string;
    parentUnitId?: string | null;
  }) => void;
}) {
  const [category, setCategory] = useState<Category>('dispositivos');
  const [tipo, setTipo] = useState<UnitType>('artigo');
  const [identificacao, setIdentificacao] = useState('');
  const [titulo, setTitulo] = useState('');
  const [parentUnitId, setParentUnitId] = useState<string>('');

  const typeOptions = category === 'divisoes' ? DIVISION_TYPES : HIERARCHY_TYPES;
  const validParents = useMemo(() => getValidParents(tipo, units), [tipo, units]);
  const isDivision = isStructuralType(tipo);

  if (!open) return null;

  const handleConfirm = () => {
    onConfirm({
      tipoUnidade: tipo,
      identificacao: identificacao.trim() || undefined,
      texto: isDivision ? titulo.trim() : undefined,
      parentUnitId: parentUnitId || null,
    });
    setIdentificacao('');
    setTitulo('');
    setParentUnitId('');
    setTipo(category === 'divisoes' ? 'titulo' : 'artigo');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div
        className="w-full max-w-md rounded-[14px] border border-line bg-surface p-6 shadow-lg"
        role="dialog"
        aria-labelledby="add-unit-title"
      >
        <h3 id="add-unit-title" className="text-page-title mb-4 text-[18px]">
          Adicionar elemento
        </h3>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setCategory('dispositivos');
              setTipo('artigo');
            }}
            className={`flex-1 rounded-[10px] border px-3 py-2 text-[13px] font-semibold ${
              category === 'dispositivos'
                ? 'border-brand bg-brand-soft text-brand'
                : 'border-line text-ink-3'
            }`}
          >
            Dispositivos
          </button>
          <button
            type="button"
            onClick={() => {
              setCategory('divisoes');
              setTipo('titulo');
            }}
            className={`flex-1 rounded-[10px] border px-3 py-2 text-[13px] font-semibold ${
              category === 'divisoes'
                ? 'border-brand bg-brand-soft text-brand'
                : 'border-line text-ink-3'
            }`}
          >
            Divisões
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[12px] text-ink-3">Tipo</label>
            <Select
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value as UnitType);
                setParentUnitId('');
              }}
            >
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {UNIT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>

          {validParents.length > 0 && (
            <div>
              <label className="mb-1 block text-[12px] text-ink-3">Vincular a (pai)</label>
              <Select value={parentUnitId} onChange={(e) => setParentUnitId(e.target.value)}>
                <option value="">Nenhum (nível superior)</option>
                {validParents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.identificacao ?? UNIT_TYPE_LABELS[p.tipoUnidade]} (
                    {UNIT_TYPE_LABELS[p.tipoUnidade]})
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[12px] text-ink-3">Identificação (opcional)</label>
            <Input
              value={identificacao}
              onChange={(e) => setIdentificacao(e.target.value)}
              placeholder={
                isDivision ? 'Ex.: TÍTULO II, CAPÍTULO III, ANEXO I' : 'Ex.: Art. 5º, § 1º, I, 6º-A'
              }
              className="font-mono"
            />
          </div>

          {isDivision && (
            <div>
              <label className="mb-1 block text-[12px] text-ink-3">Título</label>
              <Input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex.: DISPOSIÇÕES GERAIS, DO IMPOSTO"
              />
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>Adicionar</Button>
        </div>
      </div>
    </div>
  );
}
