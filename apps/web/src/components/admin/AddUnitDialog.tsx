'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import {
  type AddContext,
  DIVISION_TYPES,
  getParentOptions,
  hasEmentaUnit,
  HIERARCHY_TYPES,
  isRecommendedParent,
  isStructuralType,
  isTextGroupType,
  suggestParentId,
  suggestTypesForContext,
  TEXT_GROUP_TYPES,
  UNIT_TYPE_LABELS,
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

export function AddUnitDialog({
  open,
  units,
  context = { mode: 'end' },
  onClose,
  onConfirm,
}: {
  open: boolean;
  units: NormativeUnit[];
  context?: AddContext;
  onClose: () => void;
  onConfirm: (payload: {
    tipoUnidade: UnitType;
    identificacao?: string;
    texto?: string;
    parentUnitId?: string | null;
    afterUnitId?: string | null;
    formatacao?: UnitFormatacao | null;
  }) => void;
}) {
  const [category, setCategory] = useState<Category>('dispositivos');
  const [tipo, setTipo] = useState<UnitType>('artigo');
  const [identificacao, setIdentificacao] = useState('');
  const [titulo, setTitulo] = useState('');
  const [parentUnitId, setParentUnitId] = useState<string>('');
  const [formatacao, setFormatacao] = useState<UnitFormatacao>({
    ...DEFAULT_TEXTO_SIMPLES_FORMAT,
  });
  const [error, setError] = useState('');

  const ementaExists = hasEmentaUnit(units);
  const suggestedTypes = useMemo(
    () => suggestTypesForContext(context, units),
    [context, units],
  );

  useEffect(() => {
    if (!open) return;
    const preferred =
      suggestedTypes.find((t) => !isTextGroupType(t) || t === 'texto_simples') ?? 'artigo';
    setCategory(categoryOf(preferred));
    setTipo(preferred);
    const suggested = suggestParentId(preferred, units, context);
    setParentUnitId(suggested ?? '');
    setIdentificacao('');
    setTitulo('');
    setFormatacao({ ...DEFAULT_TEXTO_SIMPLES_FORMAT });
    setError('');
  }, [open, context.anchorId, context.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeOptions =
    category === 'divisoes'
      ? DIVISION_TYPES
      : category === 'texto'
        ? TEXT_GROUP_TYPES
        : HIERARCHY_TYPES;

  const parentOptions = useMemo(
    () => getParentOptions(tipo, units),
    [tipo, units],
  );

  const isDivision = isStructuralType(tipo);
  const isTextGroup = category === 'texto';
  const isSimple = tipo === 'texto_simples';
  const isEmenta = tipo === 'ementa';
  const isPreambulo = tipo === 'preambulo';

  const parentUnit = parentUnitId ? units.find((u) => u.id === parentUnitId) : null;
  const nonstandard =
    Boolean(parentUnit) && !isRecommendedParent(tipo, parentUnit!.tipoUnidade);

  const contextLabel =
    context.mode === 'inside' && context.anchorId
      ? `Dentro de ${units.find((u) => u.id === context.anchorId)?.identificacao ?? 'elemento'}`
      : context.mode === 'after' && context.anchorId
        ? `Após ${units.find((u) => u.id === context.anchorId)?.identificacao ?? 'elemento'}`
        : 'Ao final da estrutura';

  if (!open) return null;

  const applyTipo = (next: UnitType) => {
    setTipo(next);
    setParentUnitId(suggestParentId(next, units, context) ?? '');
    setError('');
  };

  const handleConfirm = () => {
    setError('');
    if (isEmenta && ementaExists) {
      setError('Este ato já possui Ementa. Edite a existente em vez de incluir outra.');
      return;
    }
    if ((isEmenta || isPreambulo || isSimple) && !titulo.trim()) {
      setError('Informe o conteúdo do elemento.');
      return;
    }

    const afterUnitId =
      context.mode === 'after' && context.anchorId ? context.anchorId : null;

    if (isTextGroup) {
      onConfirm({
        tipoUnidade: tipo,
        identificacao: isEmenta ? 'Ementa' : isPreambulo ? 'Preâmbulo' : undefined,
        texto: titulo.trim() || ' ',
        parentUnitId: isEmenta ? null : parentUnitId || null,
        afterUnitId,
        formatacao: isSimple ? formatacao : null,
      });
    } else {
      onConfirm({
        tipoUnidade: tipo,
        identificacao: identificacao.trim() || undefined,
        texto: isDivision ? titulo.trim() || undefined : undefined,
        parentUnitId: parentUnitId || null,
        afterUnitId,
        formatacao: null,
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-[14px] border border-line bg-surface p-6 shadow-lg"
        role="dialog"
        aria-labelledby="add-unit-title"
      >
        <h3 id="add-unit-title" className="text-page-title mb-1 text-[18px]">
          Adicionar elemento
        </h3>
        <p className="mb-4 text-[12px] text-ink-3">{contextLabel}</p>

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
                applyTipo(tab.defaultTipo);
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
              onChange={(e) => applyTipo(e.target.value as UnitType)}
            >
              {typeOptions.map((t) => {
                const suggested = suggestedTypes.includes(t);
                return (
                  <option key={t} value={t} disabled={t === 'ementa' && ementaExists}>
                    {suggested ? '★ ' : ''}
                    {UNIT_TYPE_LABELS[t]}
                    {t === 'ementa' && ementaExists ? ' (já cadastrada)' : ''}
                    {suggested ? ' — sugerido' : ''}
                  </option>
                );
              })}
            </Select>
            {suggestedTypes.length > 0 && (
              <p className="mt-1 text-[11px] text-ink-4">
                Tipos marcados com ★ são os mais adequados para esta posição; os demais
                permanecem disponíveis.
              </p>
            )}
          </div>

          {!isEmenta && (
            <div>
              <label className="mb-1 block text-[12px] text-ink-3">
                Vincular a (pai)
              </label>
              <Select
                value={parentUnitId}
                onChange={(e) => setParentUnitId(e.target.value)}
              >
                <option value="">Nenhum — nível superior</option>
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
                  Este vínculo foge do padrão legislativo usual. A inclusão será permitida
                  para reproduzir fielmente o ato publicado.
                </p>
              )}
            </div>
          )}

          {!isTextGroup && (
            <div>
              <label className="mb-1 block text-[12px] text-ink-3">Identificação (opcional)</label>
              <Input
                value={identificacao}
                onChange={(e) => setIdentificacao(e.target.value)}
                placeholder={
                  isDivision ? 'Ex.: TÍTULO II, CAPÍTULO III, ANEXO I' : 'Ex.: Art. 5º, § 1º, I'
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
                placeholder={
                  isEmenta
                    ? 'Texto da ementa oficial do ato…'
                    : isPreambulo
                      ? 'Ex.: O PREFEITO MUNICIPAL…\n\nCONSIDERANDO …'
                      : isSimple
                        ? 'Ex.: DECRETA…'
                        : 'Ex.: DISPOSIÇÕES GERAIS'
                }
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
          <Button onClick={handleConfirm} disabled={isEmenta && ementaExists}>
            Adicionar
          </Button>
        </div>
      </div>
    </div>
  );
}
