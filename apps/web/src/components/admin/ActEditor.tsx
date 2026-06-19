'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  GripVertical,
  Plus,
} from 'lucide-react';
import { AdminTopbar } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import {
  addUnit,
  publishAct,
  saveUnits,
  submitForReview,
  updateAct,
  type UnitPayload,
} from '@/lib/admin-api';
import { ACT_TYPE_LABELS, cn } from '@/lib/format';
import type { ActDetail, NormativeUnit } from '@/lib/types';

interface EditorAct extends ActDetail {
  statusPublicacao?: string;
  hierarchyValid?: boolean;
  observacoesInternas?: string | null;
}

export function ActEditor({ initialAct }: { initialAct: EditorAct }) {
  const router = useRouter();
  const { toast } = useToast();
  const [act, setAct] = useState(initialAct);
  const [units, setUnits] = useState<NormativeUnit[]>(initialAct.units);
  const [ementa, setEmenta] = useState(initialAct.ementa);
  const [assunto, setAssunto] = useState(initialAct.assunto ?? '');
  const [orgao, setOrgao] = useState(initialAct.orgaoOrigem ?? '');
  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const hierarchyValid = units.every((u, i) => u.ordem === i);

  const normalizeOrdem = useCallback((list: NormativeUnit[]) => {
    return list.map((u, i) => ({ ...u, ordem: i }));
  }, []);

  const moveUnit = (index: number, direction: -1 | 1) => {
    const next = [...units];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setUnits(normalizeOrdem(next));
  };

  const onDragStart = (index: number) => setDragIndex(index);

  const onDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) return;
    const next = [...units];
    const [removed] = next.splice(dragIndex, 1);
    next.splice(index, 0, removed);
    setUnits(normalizeOrdem(next));
    setDragIndex(null);
  };

  const updateUnitText = (id: string, texto: string) => {
    setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, texto } : u)));
  };

  const handleAddUnit = async () => {
    try {
      const updated = await addUnit(act.id, {
        tipoUnidade: 'artigo',
        identificacao: `Art. ${units.filter((u) => u.tipoUnidade === 'artigo').length + 1}º`,
        texto: '',
      });
      setAct(updated);
      setUnits(updated.units);
      toast('Dispositivo adicionado', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao adicionar', 'danger');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAct(act.id, { ementa, assunto, orgaoOrigem: orgao });
      const payload: UnitPayload[] = units.map((u, i) => ({
        id: u.id,
        tipoUnidade: u.tipoUnidade,
        identificacao: u.identificacao,
        texto: u.texto,
        ordem: i,
      }));
      const updated = await saveUnits(act.id, payload);
      setAct(updated);
      setUnits(updated.units);
      toast('Rascunho salvo', 'ok');
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao salvar', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitReview = async () => {
    setSaving(true);
    try {
      await updateAct(act.id, { ementa, assunto, orgaoOrigem: orgao });
      const payload: UnitPayload[] = units.map((u, i) => ({
        id: u.id,
        tipoUnidade: u.tipoUnidade,
        identificacao: u.identificacao,
        texto: u.texto,
        ordem: i,
      }));
      await saveUnits(act.id, payload);
      const updated = await submitForReview(act.id);
      setAct(updated);
      toast('Enviado para revisão', 'ok');
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao enviar', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setSaving(true);
    try {
      await updateAct(act.id, { ementa, assunto, orgaoOrigem: orgao });
      const payload: UnitPayload[] = units.map((u, i) => ({
        id: u.id,
        tipoUnidade: u.tipoUnidade,
        identificacao: u.identificacao,
        texto: u.texto,
        ordem: i,
      }));
      await saveUnits(act.id, payload);
      const updated = await publishAct(act.id);
      setAct(updated);
      toast('Ato publicado no portal', 'ok');
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao publicar', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const statusLabel: Record<string, string> = {
    rascunho: 'Rascunho',
    em_revisao: 'Em revisão',
    publicado: 'Publicado',
  };

  return (
    <>
      <AdminTopbar
        title="Editor de texto estruturado"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/atos">
              <Button variant="ghost" size="sm">
                Voltar
              </Button>
            </Link>
            <Button variant="outlined" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar rascunho'}
            </Button>
            {act.statusPublicacao !== 'publicado' && (
              <Button variant="tonal" size="sm" onClick={handleSubmitReview}>
                Enviar para revisão
              </Button>
            )}
            {act.statusPublicacao === 'em_revisao' && (
              <Button size="sm" onClick={handlePublish}>
                Publicar
              </Button>
            )}
          </div>
        }
      />

      <div className="grid flex-1 gap-6 overflow-auto p-6 lg:grid-cols-[340px_1fr]">
        <section className="space-y-4 rounded-[14px] border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-section">Metadados</h2>
            <Badge variant="info">
              {statusLabel[act.statusPublicacao ?? 'rascunho'] ?? act.statusPublicacao}
            </Badge>
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[12px] text-ink-3">Tipo</label>
              <Input value={ACT_TYPE_LABELS[act.tipo]} readOnly />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[12px] text-ink-3">Número</label>
                <Input value={act.numero} readOnly className="font-mono" />
              </div>
              <div>
                <label className="mb-1 block text-[12px] text-ink-3">Ano</label>
                <Input value={act.ano} readOnly className="font-mono" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[12px] text-ink-3">Ementa</label>
              <textarea
                value={ementa}
                onChange={(e) => setEmenta(e.target.value)}
                className="min-h-[80px] w-full rounded-[10px] border border-line px-3.5 py-2 text-[13.5px] focus-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] text-ink-3">Assunto</label>
              <Input value={assunto} onChange={(e) => setAssunto(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] text-ink-3">Órgão de origem</label>
              <Input value={orgao} onChange={(e) => setOrgao(e.target.value)} />
            </div>
          </div>
        </section>

        <section className="rounded-[14px] border border-line bg-surface p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-section">Texto estruturado</h2>
            <div
              className={cn(
                'flex items-center gap-2 text-[12.5px] font-semibold',
                hierarchyValid ? 'text-ok' : 'text-warn',
              )}
            >
              {hierarchyValid ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              {hierarchyValid ? 'Hierarquia válida' : 'Revise a ordem dos dispositivos'}
            </div>
          </div>

          <div className="space-y-2">
            {units.map((unit, index) => (
              <div
                key={unit.id}
                draggable
                onDragStart={() => onDragStart(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(index)}
                className={cn(
                  'flex items-start gap-2 rounded-[10px] border border-line-2 bg-surface-2 p-3 transition',
                  dragIndex === index && 'opacity-50',
                )}
              >
                <GripVertical className="mt-1 h-4 w-4 shrink-0 cursor-grab text-ink-4" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[12px] font-semibold text-brand">
                      {unit.identificacao ?? unit.tipoUnidade}
                    </span>
                    <Badge
                      variant={
                        unit.status === 'vigente'
                          ? 'ok'
                          : unit.status === 'revogada'
                            ? 'danger'
                            : 'warn'
                      }
                    >
                      {unit.status}
                    </Badge>
                  </div>
                  <textarea
                    value={unit.texto}
                    onChange={(e) => updateUnitText(unit.id, e.target.value)}
                    rows={3}
                    className="w-full rounded-[8px] border border-line bg-surface px-3 py-2 text-[13px] focus-ring"
                  />
                </div>
                <div className="flex shrink-0 flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveUnit(index, -1)}
                    disabled={index === 0}
                    className="touch-target rounded p-1.5 text-ink-4 hover:bg-surface hover:text-brand disabled:opacity-30"
                    aria-label="Mover para cima"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveUnit(index, 1)}
                    disabled={index === units.length - 1}
                    className="touch-target rounded p-1.5 text-ink-4 hover:bg-surface hover:text-brand disabled:opacity-30"
                    aria-label="Mover para baixo"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <Button variant="tonal" size="sm" className="mt-4" onClick={handleAddUnit}>
            <Plus className="h-4 w-4" />
            Adicionar dispositivo
          </Button>
        </section>
      </div>
    </>
  );
}
