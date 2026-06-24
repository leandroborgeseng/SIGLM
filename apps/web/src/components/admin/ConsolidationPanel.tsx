'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdminTopbar } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import {
  applyConsolidation,
  listConsolidationActs,
  listConsolidationUnits,
  previewConsolidation,
  type ConsolidationAct,
  type ConsolidationPreview,
  type ConsolidationUnit,
} from '@/lib/admin-api';

const CHANGE_TYPES = [
  { value: 'alteracao_redacao', label: 'Alteração de redação' },
  { value: 'inclusao', label: 'Inclusão' },
  { value: 'revogacao_parcial', label: 'Revogação parcial' },
  { value: 'revogacao_total', label: 'Revogação total' },
  { value: 'renumeracao', label: 'Renumeração' },
];

export function ConsolidationPanel() {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [acts, setActs] = useState<ConsolidationAct[]>([]);
  const [units, setUnits] = useState<ConsolidationUnit[]>([]);
  const [preview, setPreview] = useState<ConsolidationPreview | null>(null);
  const [loading, setLoading] = useState(false);

  const [alteradoraId, setAlteradoraId] = useState('');
  const [alteradaId, setAlteradaId] = useState(searchParams.get('act') ?? '');
  const [unitId, setUnitId] = useState('');
  const [tipo, setTipo] = useState('alteracao_redacao');
  const [textoNovo, setTextoNovo] = useState('');
  const [identificacao, setIdentificacao] = useState('');
  const [fundamento, setFundamento] = useState('');
  const [data, setData] = useState('');

  useEffect(() => {
    listConsolidationActs()
      .then(setActs)
      .catch(() => toast('Erro ao carregar normas', 'danger'));
  }, [toast]);

  useEffect(() => {
    if (!alteradaId) {
      setUnits([]);
      return;
    }
    listConsolidationUnits(alteradaId)
      .then((u) => {
        setUnits(u);
        setUnitId('');
      })
      .catch(() => toast('Erro ao carregar dispositivos', 'danger'));
  }, [alteradaId, toast]);

  const buildPayload = useCallback(() => {
    const payload: Record<string, unknown> = {
      normaAlteradoraActId: alteradoraId,
      normaAlteradaActId: alteradaId,
      tipoAlteracao: tipo,
    };
    if (unitId) payload.unitId = unitId;
    if (textoNovo) payload.textoNovo = textoNovo;
    if (identificacao) payload.identificacao = identificacao;
    if (fundamento) payload.fundamento = fundamento;
    if (data) payload.data = data;
    return payload;
  }, [alteradoraId, alteradaId, tipo, unitId, textoNovo, identificacao, fundamento, data]);

  const handlePreview = async () => {
    if (!alteradoraId || !alteradaId) {
      toast('Selecione as normas alteradora e alterada', 'warn');
      return;
    }
    setLoading(true);
    try {
      const result = await previewConsolidation(buildPayload());
      setPreview(result);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro na pré-visualização', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!alteradoraId || !alteradaId) {
      toast('Selecione as normas', 'warn');
      return;
    }
    setLoading(true);
    try {
      const result = await applyConsolidation(buildPayload());
      setPreview(result);
      toast('Consolidação aplicada com sucesso', 'ok');
      if (alteradaId) {
        const u = await listConsolidationUnits(alteradaId);
        setUnits(u);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao aplicar', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const isInclusao = tipo === 'inclusao';
  const isRevogacao = tipo === 'revogacao_parcial' || tipo === 'revogacao_total';
  const showTextoNovo = !isRevogacao;

  return (
    <>
      <AdminTopbar title="Consolidação normativa" />

      <div className="flex-1 overflow-auto p-6">
        <div className="mb-6 rounded-[14px] border border-line bg-surface-2 px-4 py-3 text-[13px] text-ink-2">
          Esta tela é para <strong>consulta, auditoria e correção</strong> de vínculos consolidados.
          A consolidação principal ocorre automaticamente ao publicar normas alteradoras com efeitos
          legislativos cadastrados no editor estruturado.
        </div>
        <section className="mb-6 grid gap-4 rounded-[14px] border border-line bg-surface p-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-[12px] text-ink-3">Norma alteradora</label>
            <Select value={alteradoraId} onChange={(e) => setAlteradoraId(e.target.value)}>
              <option value="">Selecione...</option>
              {acts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codigo}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-ink-3">Norma alterada</label>
            <Select value={alteradaId} onChange={(e) => setAlteradaId(e.target.value)}>
              <option value="">Selecione...</option>
              {acts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codigo}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-ink-3">Dispositivo</label>
            {isInclusao ? (
              <Input
                placeholder="Ex.: Art. 6º"
                value={identificacao}
                onChange={(e) => setIdentificacao(e.target.value)}
              />
            ) : (
              <Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">Selecione...</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.identificacao ?? u.tipoUnidade} ({u.status})
                  </option>
                ))}
              </Select>
            )}
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-ink-3">Tipo de alteração</label>
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {CHANGE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
        </section>

        <section className="mb-6 grid gap-4 rounded-[14px] border border-line bg-surface p-5 sm:grid-cols-2">
          {showTextoNovo && (
            <div className={isInclusao ? 'sm:col-span-2' : ''}>
              <label className="mb-1 block text-[12px] text-ink-3">
                {isInclusao ? 'Texto do novo dispositivo' : 'Nova redação'}
              </label>
              <textarea
                value={textoNovo}
                onChange={(e) => setTextoNovo(e.target.value)}
                rows={5}
                className="w-full rounded-[10px] border border-line px-3.5 py-2 text-[13.5px] focus-ring legal-body"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-[12px] text-ink-3">Fundamento (opcional)</label>
            <Input
              placeholder="Ex.: Art. 1º da Lei nº X/2026"
              value={fundamento}
              onChange={(e) => setFundamento(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-ink-3">Data da alteração</label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        </section>

        <div className="mb-4 flex gap-2">
          <Button variant="outlined" onClick={handlePreview} disabled={loading}>
            Pré-visualizar
          </Button>
        </div>

        {preview && (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-[14px] border border-danger-bd bg-danger-bg p-5">
                <h2 className="text-section mb-3 text-danger">Redação anterior</h2>
                <p
                  className={`legal-body text-ink-2 ${preview.textoAnterior?.startsWith('(') ? 'italic text-ink-3' : 'text-ink-4 line-through'}`}
                >
                  {preview.textoAnterior ?? '—'}
                </p>
              </div>
              <div className="rounded-[14px] border border-ok-bd bg-ok-bg p-5">
                <h2 className="text-section mb-3 text-ok">Nova redação</h2>
                <p className="legal-body text-ink">
                  {preview.textoNovo ?? (isRevogacao ? '(dispositivo revogado — texto preservado no histórico)' : '—')}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-[10px] border border-warn-bd bg-warn-bg px-4 py-3">
              <p className="text-section mb-1 text-warn">Nota gerada automaticamente</p>
              <p className="font-mono text-[13px] text-ink-2">{preview.notaGerada}</p>
            </div>
          </>
        )}

        <Button className="mt-6" onClick={handleApply} disabled={loading || !preview}>
          Aplicar consolidação
        </Button>
      </div>
    </>
  );
}
