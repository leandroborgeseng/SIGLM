'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, Link2, Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { UnitTreePicker } from '@/components/admin/UnitTreePicker';
import { AdminTopbar } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import {
  correctConsolidationLink,
  listConsolidationActs,
  listConsolidationLinks,
  listConsolidationUnits,
  registerExternalEffect,
  type ConsolidationAct,
  type ConsolidationLink,
  type ConsolidationUnit,
} from '@/lib/admin-api';
import type { ActType, InclusaoPosicionamento, UnitType } from '@/lib/types';
import { INCLUSION_UNIT_TYPES, UNIT_TYPE_LABELS } from '@/lib/unit-hierarchy';

const CHANGE_TYPES = [
  { value: 'alteracao_redacao', label: 'Alteração de redação' },
  { value: 'inclusao', label: 'Inclusão' },
  { value: 'revogacao_parcial', label: 'Revogação parcial' },
  { value: 'revogacao_total', label: 'Revogação total' },
];

const POSICIONAMENTO: { value: InclusaoPosicionamento; label: string }[] = [
  { value: 'antes_de', label: 'Antes de' },
  { value: 'apos', label: 'Após' },
  { value: 'dentro_de', label: 'Dentro de' },
];

const ACT_TYPES: { value: ActType; label: string }[] = [
  { value: 'lei', label: 'Lei' },
  { value: 'lei_complementar', label: 'Lei Complementar' },
  { value: 'decreto', label: 'Decreto' },
  { value: 'portaria', label: 'Portaria' },
  { value: 'resolucao', label: 'Resolução' },
  { value: 'instrucao_normativa', label: 'Instrução Normativa' },
];

export function ConsolidationPanel() {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [acts, setActs] = useState<ConsolidationAct[]>([]);
  const [links, setLinks] = useState<ConsolidationLink[]>([]);
  const [unitsAlterada, setUnitsAlterada] = useState<ConsolidationUnit[]>([]);
  const [unitsAlteradora, setUnitsAlteradora] = useState<ConsolidationUnit[]>([]);
  const [extUnitsAlterada, setExtUnitsAlterada] = useState<ConsolidationUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [showExternalForm, setShowExternalForm] = useState(false);

  const [filterAlteradaId, setFilterAlteradaId] = useState(searchParams.get('act') ?? '');
  const [filterAlteradoraId, setFilterAlteradoraId] = useState('');
  const [incompleteOnly, setIncompleteOnly] = useState(false);

  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [correctionSourceUnitId, setCorrectionSourceUnitId] = useState<string | null>(null);

  // External effect form
  const [extTipo, setExtTipo] = useState<ActType | ''>('');
  const [extNumero, setExtNumero] = useState('');
  const [extAno, setExtAno] = useState('');
  const [extEmissor, setExtEmissor] = useState('');
  const [extData, setExtData] = useState('');
  const [extDescricao, setExtDescricao] = useState('');
  const [extUrl, setExtUrl] = useState('');
  const [extProcesso, setExtProcesso] = useState('');
  const [extTribunal, setExtTribunal] = useState('');
  const [extAlteradaId, setExtAlteradaId] = useState('');
  const [extUnitId, setExtUnitId] = useState<string | null>(null);
  const [extEffectType, setExtEffectType] = useState('alteracao_redacao');
  const [extTextoNovo, setExtTextoNovo] = useState('');
  const [extIdentificacao, setExtIdentificacao] = useState('');
  const [extReferenciaUnitId, setExtReferenciaUnitId] = useState<string | null>(null);
  const [extPosicionamento, setExtPosicionamento] = useState<InclusaoPosicionamento>('apos');
  const [extTipoIncluido, setExtTipoIncluido] = useState<UnitType>('artigo');
  const [extFundamento, setExtFundamento] = useState('');
  const [extEffectData, setExtEffectData] = useState('');

  const loadLinks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listConsolidationLinks({
        normaAlteradaActId: filterAlteradaId || undefined,
        normaAlteradoraActId: filterAlteradoraId || undefined,
        incompleteOnly,
      });
      setLinks(data);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao carregar vínculos', 'danger');
    } finally {
      setLoading(false);
    }
  }, [filterAlteradaId, filterAlteradoraId, incompleteOnly, toast]);

  useEffect(() => {
    listConsolidationActs()
      .then(setActs)
      .catch(() => toast('Erro ao carregar normas', 'danger'));
  }, [toast]);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  useEffect(() => {
    if (!filterAlteradaId) {
      setUnitsAlterada([]);
      return;
    }
    listConsolidationUnits(filterAlteradaId)
      .then(setUnitsAlterada)
      .catch(() => toast('Erro ao carregar dispositivos', 'danger'));
  }, [filterAlteradaId, toast]);

  useEffect(() => {
    if (!filterAlteradoraId) {
      setUnitsAlteradora([]);
      return;
    }
    listConsolidationUnits(filterAlteradoraId)
      .then(setUnitsAlteradora)
      .catch(() => undefined);
  }, [filterAlteradoraId]);

  useEffect(() => {
    if (!extAlteradaId) {
      setExtUnitsAlterada([]);
      return;
    }
    listConsolidationUnits(extAlteradaId)
      .then(setExtUnitsAlterada)
      .catch(() => undefined);
  }, [extAlteradaId]);

  const handleCorrect = async (linkId: string) => {
    if (!correctionSourceUnitId) {
      toast('Selecione o elemento alterador', 'warn');
      return;
    }
    setLoading(true);
    try {
      await correctConsolidationLink(linkId, {
        sourceUnitId: correctionSourceUnitId,
        regenerateNote: true,
      });
      toast('Vínculo corrigido', 'ok');
      setCorrectingId(null);
      setCorrectionSourceUnitId(null);
      await loadLinks();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao corrigir', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterExternal = async () => {
    if (!extEmissor.trim() || !extDescricao.trim() || !extAlteradaId) {
      toast('Preencha emissor, descrição e norma afetada', 'warn');
      return;
    }
    if (extEffectType !== 'inclusao' && !extUnitId) {
      toast('Selecione o dispositivo afetado', 'warn');
      return;
    }
    if (
      (extEffectType === 'alteracao_redacao' || extEffectType === 'inclusao') &&
      !extTextoNovo.trim()
    ) {
      toast('Texto da alteração é obrigatório', 'warn');
      return;
    }

    setLoading(true);
    try {
      const result = await registerExternalEffect({
        source: {
          tipo: extTipo || undefined,
          numero: extNumero || undefined,
          ano: extAno ? Number(extAno) : undefined,
          emissor: extEmissor.trim(),
          data: extData || undefined,
          descricao: extDescricao.trim(),
          url: extUrl || undefined,
          processo: extProcesso || undefined,
          tribunal: extTribunal || undefined,
        },
        normaAlteradaActId: extAlteradaId,
        tipoAlteracao: extEffectType,
        unitId: extUnitId ?? undefined,
        textoNovo: extTextoNovo || undefined,
        identificacao: extIdentificacao || undefined,
        data: extEffectData || undefined,
        fundamento: extFundamento || undefined,
        referenciaUnitId: extReferenciaUnitId ?? undefined,
        posicionamento: extPosicionamento,
        tipoDispositivoIncluido: extTipoIncluido,
      });
      toast(`Efeito externo registrado: ${result.notaGerada}`, 'ok');
      setShowExternalForm(false);
      await loadLinks();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao registrar efeito externo', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const isExtInclusao = extEffectType === 'inclusao';
  const isExtRevogacao =
    extEffectType === 'revogacao_parcial' || extEffectType === 'revogacao_total';

  return (
    <>
      <AdminTopbar title="Consolidação normativa" />

      <div className="flex-1 overflow-auto p-6">
        <div className="mb-6 rounded-[14px] border border-line bg-surface-2 px-4 py-3 text-[13px] text-ink-2">
          A consolidação ordinária ocorre automaticamente ao publicar normas alteradoras com{' '}
          <strong>efeitos legislativos</strong> cadastrados no editor estruturado (vinculados ao
          dispositivo alterador). Esta tela serve para <strong>consulta, auditoria, correção</strong>{' '}
          de vínculos existentes e registro excepcional de efeitos de <strong>fonte externa</strong>.
        </div>

        <section className="mb-6 rounded-[14px] border border-line bg-surface p-5">
          <h2 className="text-section mb-4 flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Vínculos consolidados
          </h2>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-[12px] text-ink-3">Filtrar norma alterada</label>
              <Select value={filterAlteradaId} onChange={(e) => setFilterAlteradaId(e.target.value)}>
                <option value="">Todas</option>
                {acts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.codigo}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-[12px] text-ink-3">Filtrar norma alteradora</label>
              <Select
                value={filterAlteradoraId}
                onChange={(e) => setFilterAlteradoraId(e.target.value)}
              >
                <option value="">Todas</option>
                {acts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.codigo}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-[13px] text-ink-2">
                <input
                  type="checkbox"
                  checked={incompleteOnly}
                  onChange={(e) => setIncompleteOnly(e.target.checked)}
                  className="rounded border-line"
                />
                Apenas incompletos
              </label>
            </div>
            <div className="flex items-end">
              <Button variant="outlined" onClick={() => void loadLinks()} disabled={loading}>
                Atualizar
              </Button>
            </div>
          </div>

          {links.length === 0 ? (
            <p className="text-[13px] text-ink-3">Nenhum vínculo encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[11px] uppercase tracking-wide text-ink-3">
                    <th className="px-2 py-2">Data</th>
                    <th className="px-2 py-2">Origem</th>
                    <th className="px-2 py-2">Alterada</th>
                    <th className="px-2 py-2">Dispositivo afetado</th>
                    <th className="px-2 py-2">Fonte / alterador</th>
                    <th className="px-2 py-2">Nota</th>
                    <th className="px-2 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((link) => (
                    <tr key={link.id} className="border-b border-line/60 align-top">
                      <td className="px-2 py-2 whitespace-nowrap">{link.data}</td>
                      <td className="px-2 py-2">
                        <span
                          className={
                            link.origem === 'externa'
                              ? 'text-brand'
                              : link.incomplete
                                ? 'text-warn'
                                : 'text-ok'
                          }
                        >
                          {link.origem === 'externa' ? 'Externa' : link.incomplete ? 'Incompleta' : 'Interna'}
                        </span>
                      </td>
                      <td className="px-2 py-2">{link.normaAlterada.codigo}</td>
                      <td className="px-2 py-2 font-mono text-[12px]">
                        {link.targetUnit?.identificacao ?? '—'}
                      </td>
                      <td className="px-2 py-2">
                        {link.origem === 'externa' && link.externalSource ? (
                          <span className="text-[12px]">
                            {link.externalSource.emissor}
                            {link.externalSource.url && (
                              <a
                                href={link.externalSource.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-1 text-brand hover:underline"
                              >
                                <ExternalLink className="inline h-3 w-3" />
                              </a>
                            )}
                          </span>
                        ) : (
                          <span className="text-[12px]">
                            {link.normaAlteradora?.codigo ?? '—'}
                            {link.sourceUnit?.identificacao && (
                              <span className="ml-1 font-mono text-ink-3">
                                ({link.sourceUnit.identificacao})
                              </span>
                            )}
                            {link.incomplete && (
                              <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-warn" />
                            )}
                          </span>
                        )}
                      </td>
                      <td className="max-w-[200px] px-2 py-2 text-[12px] text-ink-3">
                        {link.notaGerada ?? '—'}
                      </td>
                      <td className="px-2 py-2">
                        {link.incomplete && link.origem === 'interna' && link.normaAlteradora && (
                          <>
                            {correctingId === link.id ? (
                              <div className="space-y-2">
                                <UnitTreePicker
                                  units={unitsAlteradora}
                                  value={correctionSourceUnitId}
                                  onChange={setCorrectionSourceUnitId}
                                  placeholder="Elemento alterador…"
                                />
                                <div className="flex gap-1">
                                  <Button
                                    size="xs"
                                    onClick={() => void handleCorrect(link.id)}
                                    disabled={loading}
                                  >
                                    Salvar
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="ghost"
                                    onClick={() => {
                                      setCorrectingId(null);
                                      setCorrectionSourceUnitId(null);
                                    }}
                                  >
                                    Cancelar
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <Button
                                size="xs"
                                variant="outlined"
                                onClick={() => {
                                  setCorrectingId(link.id);
                                  setFilterAlteradoraId(link.normaAlteradora!.id);
                                  setCorrectionSourceUnitId(null);
                                }}
                              >
                                Corrigir
                              </Button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-[14px] border border-line bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-section flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              Registrar efeito de fonte externa
            </h2>
            {!showExternalForm && (
              <Button variant="outlined" size="sm" onClick={() => setShowExternalForm(true)}>
                <Plus className="h-3.5 w-3.5" />
                Novo efeito externo
              </Button>
            )}
          </div>

          {showExternalForm && (
            <>
              <p className="mb-4 text-[13px] text-ink-3">
                Use apenas para fontes fora do sistema (ex.: lei federal, decisão judicial). A nota
                pública incluirá hyperlink para a URL informada.
              </p>

              <div className="mb-6 grid gap-4 rounded-[10px] border border-line-2 bg-surface-2/40 p-4 sm:grid-cols-2 lg:grid-cols-3">
                <p className="sm:col-span-2 lg:col-span-3 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  Fonte externa
                </p>
                <div>
                  <label className="mb-1 block text-[12px] text-ink-3">Tipo (opcional)</label>
                  <Select value={extTipo} onChange={(e) => setExtTipo(e.target.value as ActType | '')}>
                    <option value="">—</option>
                    {ACT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-[12px] text-ink-3">Número (opcional)</label>
                  <Input value={extNumero} onChange={(e) => setExtNumero(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] text-ink-3">Ano (opcional)</label>
                  <Input value={extAno} onChange={(e) => setExtAno(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] text-ink-3">Emissor *</label>
                  <Input
                    value={extEmissor}
                    onChange={(e) => setExtEmissor(e.target.value)}
                    placeholder="Ex.: Câmara dos Deputados"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] text-ink-3">Data (opcional)</label>
                  <Input type="date" value={extData} onChange={(e) => setExtData(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] text-ink-3">URL / link (opcional)</label>
                  <Input
                    value={extUrl}
                    onChange={(e) => setExtUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-[12px] text-ink-3">Descrição *</label>
                  <Input
                    value={extDescricao}
                    onChange={(e) => setExtDescricao(e.target.value)}
                    placeholder="Ex.: Lei Federal nº 14.133/2021"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] text-ink-3">Processo (opcional)</label>
                  <Input value={extProcesso} onChange={(e) => setExtProcesso(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] text-ink-3">Tribunal (opcional)</label>
                  <Input value={extTribunal} onChange={(e) => setExtTribunal(e.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[12px] text-ink-3">Norma afetada *</label>
                  <Select value={extAlteradaId} onChange={(e) => setExtAlteradaId(e.target.value)}>
                    <option value="">Selecione…</option>
                    {acts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.codigo}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-[12px] text-ink-3">Tipo de efeito *</label>
                  <Select value={extEffectType} onChange={(e) => setExtEffectType(e.target.value)}>
                    {CHANGE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </div>
                {!isExtInclusao && extAlteradaId && (
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[12px] text-ink-3">Dispositivo afetado *</label>
                    <UnitTreePicker
                      units={extUnitsAlterada}
                      value={extUnitId}
                      onChange={setExtUnitId}
                    />
                  </div>
                )}
                {isExtInclusao && extAlteradaId && (
                  <>
                    <div>
                      <label className="mb-1 block text-[12px] text-ink-3">Tipo incluído</label>
                      <Select
                        value={extTipoIncluido}
                        onChange={(e) => setExtTipoIncluido(e.target.value as UnitType)}
                      >
                        {INCLUSION_UNIT_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {UNIT_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[12px] text-ink-3">Posicionamento</label>
                      <Select
                        value={extPosicionamento}
                        onChange={(e) =>
                          setExtPosicionamento(e.target.value as InclusaoPosicionamento)
                        }
                      >
                        {POSICIONAMENTO.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[12px] text-ink-3">Identificação</label>
                      <Input
                        value={extIdentificacao}
                        onChange={(e) => setExtIdentificacao(e.target.value)}
                        className="font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-[12px] text-ink-3">
                        Dispositivo de referência
                      </label>
                      <UnitTreePicker
                        units={extUnitsAlterada}
                        value={extReferenciaUnitId}
                        onChange={setExtReferenciaUnitId}
                      />
                    </div>
                  </>
                )}
                {!isExtRevogacao && (
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[12px] text-ink-3">
                      {isExtInclusao ? 'Texto incluído' : 'Nova redação'} *
                    </label>
                    <textarea
                      value={extTextoNovo}
                      onChange={(e) => setExtTextoNovo(e.target.value)}
                      rows={4}
                      className="w-full rounded-[10px] border border-line px-3.5 py-2 text-[13.5px] focus-ring legal-body"
                    />
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-[12px] text-ink-3">Data do efeito</label>
                  <Input
                    type="date"
                    value={extEffectData}
                    onChange={(e) => setExtEffectData(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] text-ink-3">Fundamento (opcional)</label>
                  <Input value={extFundamento} onChange={(e) => setExtFundamento(e.target.value)} />
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <Button onClick={() => void handleRegisterExternal()} disabled={loading}>
                  Registrar efeito externo
                </Button>
                <Button variant="ghost" onClick={() => setShowExternalForm(false)}>
                  Cancelar
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
