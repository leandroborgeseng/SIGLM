'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import {
  DIVISION_TYPES,
  getParentOptions,
  hasEmentaUnit,
  HIERARCHY_TYPES,
  isRecommendedParent,
  isStructuralType,
  TEXT_GROUP_TYPES,
  UNIT_TYPE_LABELS,
  validateUnitsHierarchy,
} from '@/lib/unit-hierarchy';
import {
  DEFAULT_TEXTO_SIMPLES_FORMAT,
  type TextAlign,
  type LetterSpacing,
  type UnitFormatacao,
} from '@/lib/rich-text';
import type { NormativeUnit, UnitType } from '@/lib/types';

type Category = 'dispositivos' | 'divisoes' | 'texto';

function categoryOf(tipo: UnitType): Category {
  if (TEXT_GROUP_TYPES.includes(tipo) || tipo === 'considerando') return 'texto';
  if (DIVISION_TYPES.includes(tipo)) return 'divisoes';
  return 'dispositivos';
}

export function EditUnitDialog({
  open,
  unit,
  units,
  onClose,
  onSave,
}: {
  open: boolean;
  unit: NormativeUnit | null;
  units: NormativeUnit[];
  onClose: () => void;
  onSave: (patch: {
    tipoUnidade: UnitType;
    identificacao: string | null;
    texto: string;
    parentUnitId: string | null;
    formatacao?: UnitFormatacao | null;
  }) => void;
}) {
  const [category, setCategory] = useState<Category>('dispositivos');
  const [tipo, setTipo] = useState<UnitType>('artigo');
  const [identificacao, setIdentificacao] = useState('');
  const [titulo, setTitulo] = useState('');
  const [parentUnitId, setParentUnitId] = useState('');
  const [formatacao, setFormatacao] = useState<UnitFormatacao>({
    ...DEFAULT_TEXTO_SIMPLES_FORMAT,
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!unit || !open) return;
    const cat = categoryOf(unit.tipoUnidade);
    setCategory(cat);
    setTipo(unit.tipoUnidade === 'considerando' ? 'preambulo' : unit.tipoUnidade);
    setIdentificacao(unit.identificacao ?? '');
    setTitulo(unit.texto ?? '');
    setParentUnitId(unit.parentUnitId ?? '');
    setFormatacao({
      ...DEFAULT_TEXTO_SIMPLES_FORMAT,
      ...(unit.formatacao ?? {}),
    });
    setError('');
  }, [unit, open]);

  const typeOptions =
    category === 'divisoes'
      ? DIVISION_TYPES
      : category === 'texto'
        ? TEXT_GROUP_TYPES
        : HIERARCHY_TYPES;

  const parentOptions = useMemo(
    () => getParentOptions(tipo, units.filter((u) => u.id !== unit?.id), unit?.id),
    [tipo, units, unit?.id],
  );

  const isDivision = isStructuralType(tipo);
  const isTextGroup = category === 'texto';
  const isSimple = tipo === 'texto_simples';
  const isEmenta = tipo === 'ementa';
  const isPreambulo = tipo === 'preambulo';
  const otherEmentaExists =
    Boolean(unit) &&
    hasEmentaUnit(units.filter((u) => u.id !== unit?.id)) &&
    isEmenta;

  const parentUnit = parentUnitId ? units.find((u) => u.id === parentUnitId) : null;
  const nonstandard =
    Boolean(parentUnit) && !isRecommendedParent(tipo, parentUnit!.tipoUnidade);

  if (!open || !unit) return null;

  const handleSave = () => {
    if (otherEmentaExists) {
      setError('Este ato já possui Ementa. Não é permitido duplicar.');
      return;
    }
    if (isTextGroup && !titulo.trim()) {
      setError('Informe o conteúdo do elemento.');
      return;
    }

    const nextParent = isTextGroup ? null : parentUnitId || null;
    const nextTexto = isDivision || isTextGroup ? titulo : unit.texto;
    const nextIdent = isSimple
      ? null
      : isEmenta
        ? 'Ementa'
        : isPreambulo
          ? 'Preâmbulo'
          : identificacao.trim() || null;

    const nextUnits = units.map((u) =>
      u.id === unit.id
        ? {
            ...u,
            tipoUnidade: tipo,
            identificacao: nextIdent,
            texto: nextTexto,
            parentUnitId: nextParent,
            formatacao: isSimple ? formatacao : null,
          }
        : u,
    );

    if (!validateUnitsHierarchy(nextUnits)) {
      setError(
        'A alteração criaria uma estrutura inconsistente (ciclo, pai inexistente ou ordem inválida). Ajuste o vínculo ou a posição.',
      );
      return;
    }

    onSave({
      tipoUnidade: tipo,
      identificacao: nextIdent,
      texto: nextTexto,
      parentUnitId: nextParent,
      formatacao: isSimple ? formatacao : null,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-[14px] border border-line bg-surface p-6 shadow-lg"
        role="dialog"
        aria-labelledby="edit-unit-title"
      >
        <h3 id="edit-unit-title" className="mb-4 text-[18px] font-semibold">
          Editar elemento
        </h3>

        <div className="mb-4 flex flex-wrap gap-2">
          {(
            [
              { id: 'dispositivos', label: 'Dispositivos', defaultTipo: 'artigo' as UnitType },
              { id: 'divisoes', label: 'Divisões', defaultTipo: 'titulo' as UnitType },
              { id: 'texto', label: 'Texto', defaultTipo: 'texto_simples' as UnitType },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setCategory(tab.id);
                setTipo(tab.defaultTipo);
                setParentUnitId('');
                setError('');
              }}
              className={`flex-1 rounded-[10px] border px-3 py-2 text-[13px] font-semibold ${
                category === tab.id
                  ? 'border-brand bg-brand-soft text-brand'
                  : 'border-line text-ink-3'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[12px] text-ink-3">Tipo</label>
            <Select
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value as UnitType);
                setError('');
              }}
            >
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {UNIT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>

          {!isTextGroup && (
            <div>
              <label className="mb-1 block text-[12px] text-ink-3">Vincular a</label>
              <Select value={parentUnitId} onChange={(e) => setParentUnitId(e.target.value)}>
                <option value="">Nenhum (nível superior)</option>
                {parentOptions.recommended.length > 0 && (
                  <optgroup label="Recomendados">
                    {parentOptions.recommended.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.identificacao ?? UNIT_TYPE_LABELS[p.tipoUnidade]} (
                        {UNIT_TYPE_LABELS[p.tipoUnidade]})
                      </option>
                    ))}
                  </optgroup>
                )}
                {parentOptions.others.length > 0 && (
                  <optgroup label="Outros elementos do ato">
                    {parentOptions.others.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.identificacao ?? UNIT_TYPE_LABELS[p.tipoUnidade]} (
                        {UNIT_TYPE_LABELS[p.tipoUnidade]})
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
              {nonstandard && (
                <p className="mt-1 text-[12px] text-warn">
                  Este vínculo foge do padrão legislativo usual, mas será preservado.
                </p>
              )}
            </div>
          )}

          {!isTextGroup && (
            <div>
              <label className="mb-1 block text-[12px] text-ink-3">Identificação</label>
              <Input
                value={identificacao}
                onChange={(e) => setIdentificacao(e.target.value)}
                placeholder={
                  isDivision ? 'Ex.: TÍTULO II, CAPÍTULO III' : 'Ex.: Art. 5º, § 1º, I'
                }
              />
            </div>
          )}

          {(isDivision || isTextGroup) && (
            <div>
              <label className="mb-1 block text-[12px] text-ink-3">
                {isTextGroup ? 'Conteúdo' : 'Título'}
              </label>
              <textarea
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="min-h-[96px] w-full rounded-[10px] border border-line px-3.5 py-2 text-[13.5px] focus-ring"
              />
            </div>
          )}

          {isSimple && (
            <div className="space-y-3 rounded-[10px] border border-line-2 bg-surface-2 p-3">
              <p className="text-[12px] font-semibold text-ink-2">Apresentação</p>
              <Select
                value={formatacao.align ?? 'center'}
                onChange={(e) =>
                  setFormatacao((f) => ({ ...f, align: e.target.value as TextAlign }))
                }
              >
                <option value="left">Esquerda</option>
                <option value="center">Centralizado</option>
                <option value="right">Direita</option>
                <option value="justify">Justificado</option>
              </Select>
              <div className="flex flex-wrap gap-3">
                {(
                  [
                    ['bold', 'Negrito'],
                    ['italic', 'Itálico'],
                    ['underline', 'Sublinhado'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="inline-flex items-center gap-1.5 text-[12.5px]">
                    <input
                      type="checkbox"
                      checked={Boolean(formatacao[key])}
                      onChange={(e) =>
                        setFormatacao((f) => ({ ...f, [key]: e.target.checked }))
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <Select
                value={formatacao.letterSpacing ?? 'normal'}
                onChange={(e) =>
                  setFormatacao((f) => ({
                    ...f,
                    letterSpacing: e.target.value as LetterSpacing,
                  }))
                }
              >
                <option value="normal">Espaçamento normal</option>
                <option value="expanded">Espaçamento expandido</option>
              </Select>
            </div>
          )}

          {error && <p className="text-[12.5px] text-danger">{error}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>Salvar</Button>
        </div>
      </div>
    </div>
  );
}
