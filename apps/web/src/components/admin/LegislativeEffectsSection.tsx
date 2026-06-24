'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { UnitTreePicker } from '@/components/admin/UnitTreePicker';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { listConsolidationActs, listConsolidationUnits } from '@/lib/admin-api';
import type { ConsolidationAct, ConsolidationUnit } from '@/lib/admin-api';
import { INCLUSION_UNIT_TYPES, UNIT_TYPE_LABELS } from '@/lib/unit-hierarchy';
import type { EffectType, InclusaoPosicionamento, LegislativeEffect, UnitType } from '@/lib/types';

const EFFECT_TYPES: { value: EffectType; label: string }[] = [
  { value: 'alteracao_redacao', label: 'Alteração de redação' },
  { value: 'inclusao', label: 'Inclusão' },
  { value: 'revogacao_total', label: 'Revogação total' },
  { value: 'revogacao_parcial', label: 'Revogação parcial' },
  { value: 'renumeracao', label: 'Renumeração' },
];

const POSICIONAMENTO: { value: InclusaoPosicionamento; label: string }[] = [
  { value: 'antes_de', label: 'Antes de' },
  { value: 'apos', label: 'Após' },
  { value: 'dentro_de', label: 'Dentro de' },
];

function emptyEffect(sourceUnitId: string): LegislativeEffect {
  return {
    sourceUnitId,
    normaAlteradaActId: '',
    tipoEfeito: 'alteracao_redacao',
    dataVigencia: new Date().toISOString().slice(0, 10),
    ordem: 0,
  };
}

export function LegislativeEffectsSection({
  unitId,
  actId,
  effects,
  onChange,
  redacaoChildUnits,
}: {
  unitId: string;
  actId: string;
  effects: LegislativeEffect[];
  onChange: (effects: LegislativeEffect[]) => void;
  redacaoChildUnits: { id: string; identificacao: string | null; texto: string }[];
}) {
  const [acts, setActs] = useState<ConsolidationAct[]>([]);
  const [unitsByAct, setUnitsByAct] = useState<Record<string, ConsolidationUnit[]>>({});

  useEffect(() => {
    listConsolidationActs()
      .then((all) => setActs(all.filter((a) => a.id !== actId)))
      .catch(() => undefined);
  }, [actId]);

  useEffect(() => {
    const normaIds = [...new Set(effects.map((e) => e.normaAlteradaActId).filter(Boolean))];
    for (const id of normaIds) {
      if (!unitsByAct[id]) void loadUnits(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effects]);

  const loadUnits = async (normaId: string) => {
    if (unitsByAct[normaId]) return;
    const units = await listConsolidationUnits(normaId);
    setUnitsByAct((prev) => ({ ...prev, [normaId]: units }));
  };

  const updateEffect = (index: number, patch: Partial<LegislativeEffect>) => {
    onChange(effects.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };

  const addEffect = () => onChange([...effects, emptyEffect(unitId)]);

  const removeEffect = (index: number) => onChange(effects.filter((_, i) => i !== index));

  if (effects.length === 0) {
    return (
      <Button variant="ghost" size="xs" type="button" onClick={addEffect} className="mt-1">
        <Plus className="h-3 w-3" />
        Efeito legislativo
      </Button>
    );
  }

  return (
    <div className="mt-2 rounded-[8px] border border-line bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          Efeitos legislativos
        </span>
        <Button variant="ghost" size="xs" type="button" onClick={addEffect}>
          <Plus className="h-3 w-3" />
          Adicionar
        </Button>
      </div>

      <div className="space-y-3">
        {effects.map((effect, index) => {
          const normaUnits = effect.normaAlteradaActId
            ? (unitsByAct[effect.normaAlteradaActId] ?? [])
            : [];

          return (
            <div key={effect.id ?? index} className="space-y-2 rounded-[8px] border border-line-2 p-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] text-ink-4">Norma afetada</label>
                  <Select
                    value={effect.normaAlteradaActId}
                    onChange={(e) => {
                      const id = e.target.value;
                      void loadUnits(id);
                      updateEffect(index, {
                        normaAlteradaActId: id,
                        targetUnitId: null,
                        referenciaUnitId: null,
                      });
                    }}
                  >
                    <option value="">Selecione…</option>
                    {acts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.codigo}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-ink-4">Tipo de efeito</label>
                  <Select
                    value={effect.tipoEfeito}
                    onChange={(e) =>
                      updateEffect(index, { tipoEfeito: e.target.value as EffectType })
                    }
                  >
                    {EFFECT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {effect.normaAlteradaActId && effect.tipoEfeito !== 'inclusao' && (
                <div>
                  <label className="mb-1 block text-[11px] text-ink-4">Dispositivo afetado</label>
                  <UnitTreePicker
                    units={normaUnits}
                    value={effect.targetUnitId ?? null}
                    onChange={(id) => updateEffect(index, { targetUnitId: id })}
                  />
                </div>
              )}

              {effect.tipoEfeito === 'inclusao' && effect.normaAlteradaActId && (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[11px] text-ink-4">Tipo incluído</label>
                      <Select
                        value={effect.tipoDispositivoIncluido ?? ''}
                        onChange={(e) =>
                          updateEffect(index, {
                            tipoDispositivoIncluido: (e.target.value as UnitType) || null,
                          })
                        }
                      >
                        <option value="">Selecione…</option>
                        {INCLUSION_UNIT_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {UNIT_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-ink-4">Posicionamento</label>
                      <Select
                        value={effect.posicionamento ?? ''}
                        onChange={(e) =>
                          updateEffect(index, {
                            posicionamento: (e.target.value as InclusaoPosicionamento) || null,
                          })
                        }
                      >
                        <option value="">Selecione…</option>
                        {POSICIONAMENTO.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-ink-4">Identificação (ex.: Art. 6º-A)</label>
                    <Input
                      value={effect.novaIdentificacao ?? ''}
                      onChange={(e) => updateEffect(index, { novaIdentificacao: e.target.value })}
                      placeholder="Opcional — ex.: Art. 6º-A, § 3º"
                      className="font-mono text-[12px]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-ink-4">Dispositivo de referência</label>
                    <UnitTreePicker
                      units={normaUnits}
                      value={effect.referenciaUnitId ?? null}
                      onChange={(id) => updateEffect(index, { referenciaUnitId: id })}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-ink-4">Texto incluído</label>
                    <textarea
                      value={effect.textoNovo ?? ''}
                      onChange={(e) => updateEffect(index, { textoNovo: e.target.value })}
                      rows={2}
                      className="w-full rounded-[8px] border border-line px-2 py-1.5 text-[12px] focus-ring"
                    />
                  </div>
                </>
              )}

              {effect.tipoEfeito === 'alteracao_redacao' && (
                <div className="space-y-2">
                  <div>
                    <label className="mb-1 block text-[11px] text-ink-4">Nova redação (texto)</label>
                    <textarea
                      value={effect.textoNovo ?? ''}
                      onChange={(e) =>
                        updateEffect(index, { textoNovo: e.target.value, redacaoUnitId: null })
                      }
                      rows={2}
                      placeholder="Nova redação do dispositivo afetado"
                      className="w-full rounded-[8px] border border-line px-2 py-1.5 text-[12px] focus-ring"
                    />
                  </div>
                  {redacaoChildUnits.length > 0 && (
                    <div>
                      <label className="mb-1 block text-[11px] text-ink-4">
                        Ou vincular subdispositivo filho
                      </label>
                      <Select
                        value={effect.redacaoUnitId ?? ''}
                        onChange={(e) => {
                          const id = e.target.value || null;
                          updateEffect(index, {
                            redacaoUnitId: id,
                            textoNovo: id
                              ? (redacaoChildUnits.find((u) => u.id === id)?.texto ?? effect.textoNovo)
                              : effect.textoNovo,
                          });
                        }}
                      >
                        <option value="">Digitar manualmente acima</option>
                        {redacaoChildUnits.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.identificacao ?? 'Subdispositivo'} —{' '}
                            {u.texto.slice(0, 60)}
                            {u.texto.length > 60 ? '…' : ''}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {effect.tipoEfeito === 'renumeracao' && (
                <div>
                  <label className="mb-1 block text-[11px] text-ink-4">Nova identificação</label>
                  <Input
                    value={effect.novaIdentificacao ?? ''}
                    onChange={(e) => updateEffect(index, { novaIdentificacao: e.target.value })}
                    placeholder="Ex.: Art. 6º-A, § 1º-A"
                    className="font-mono text-[12px]"
                  />
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] text-ink-4">Data de vigência</label>
                  <Input
                    type="date"
                    value={effect.dataVigencia?.slice(0, 10) ?? ''}
                    onChange={(e) => updateEffect(index, { dataVigencia: e.target.value })}
                    className="text-[12px]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-ink-4">Observações</label>
                  <Input
                    value={effect.observacoes ?? ''}
                    onChange={(e) => updateEffect(index, { observacoes: e.target.value })}
                    className="text-[12px]"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button variant="ghost" size="xs" type="button" onClick={() => removeEffect(index)}>
                  <Trash2 className="h-3 w-3" />
                  Remover
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
