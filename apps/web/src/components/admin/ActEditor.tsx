'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  History,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { AddUnitDialog } from '@/components/admin/AddUnitDialog';
import { ActMetadataAttachments } from '@/components/admin/ActMetadataAttachments';
import { AdminTopbar } from '@/components/admin/AdminShell';
import { DeleteUnitDialog } from '@/components/admin/DeleteUnitDialog';
import { EditUnitDialog } from '@/components/admin/EditUnitDialog';
import {
  CompareModeToggle,
  OriginalFilePane,
} from '@/components/admin/OriginalFileCompare';
import { UnitTextEditor } from '@/components/admin/UnitTextEditor';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import {
  addUnit,
  createActEdition,
  deleteUnit,
  listActAttachments,
  listOrgans,
  publishAct,
  restoreUnitVersion,
  saveLegislativeEffects,
  saveUnits,
  submitForReview,
  updateAct,
  type OriginOrg,
  type UnitPayload,
} from '@/lib/admin-api';
import { LegislativeEffectsSection } from '@/components/admin/LegislativeEffectsSection';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';
import { ACT_TYPE_LABELS, cn, formatFormalTitle, toDateInputValue } from '@/lib/format';
import {
  DEFAULT_TEXTO_SIMPLES_FORMAT,
  type TextAlign,
  type LetterSpacing,
  type UnitFormatacao,
} from '@/lib/rich-text';
import type { ActAttachment, ActDetail, LegislativeEffect, NormativeUnit, UnitType } from '@/lib/types';
import {
  type AddContext,
  assessUnitsHierarchy,
  dragDropBlock,
  hasChildren,
  isCollapsedAway,
  moveUnitBlock,
  NON_EFFECT_SOURCE_TYPES,
  parentLabel,
  resolveActEmenta,
  unitIndentPx,
  UNIT_TYPE_LABELS,
} from '@/lib/unit-hierarchy';

interface EditorAct extends ActDetail {
  statusPublicacao?: string;
  editionOpen?: boolean;
  hierarchyValid?: boolean;
  observacoesInternas?: string | null;
}

function unitsPayload(units: NormativeUnit[]): UnitPayload[] {
  return units.map((u, i) => ({
    id: u.id,
    tipoUnidade: u.tipoUnidade,
    identificacao: u.identificacao,
    texto: u.texto,
    ordem: i,
    parentUnitId: u.parentUnitId ?? null,
    formatacao: u.formatacao ?? null,
  }));
}

function fingerprint(
  assunto: string,
  dataAto: string,
  orgaoId: string,
  units: NormativeUnit[],
) {
  return JSON.stringify({
    assunto,
    dataAto,
    orgaoId,
    units: unitsPayload(units),
    effects: units.map((u) => ({
      id: u.id,
      effects: u.efeitosLegislativos ?? [],
    })),
  });
}

export function ActEditor({ initialAct }: { initialAct: EditorAct }) {
  const router = useRouter();
  const { toast } = useToast();
  const { can } = useAdminAuth();
  const [act, setAct] = useState(initialAct);
  const [units, setUnits] = useState<NormativeUnit[]>(initialAct.units);
  const [assunto, setAssunto] = useState(initialAct.assunto ?? '');
  const [dataAto, setDataAto] = useState(toDateInputValue(initialAct.dataAto));
  const [orgaoId, setOrgaoId] = useState(initialAct.orgaoOrigemId ?? '');
  const [organs, setOrgans] = useState<OriginOrg[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addContext, setAddContext] = useState<AddContext>({ mode: 'end' });
  const [editUnit, setEditUnit] = useState<NormativeUnit | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NormativeUnit | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [originalFile, setOriginalFile] = useState<ActAttachment | null>(
    initialAct.arquivoOriginal ?? null,
  );
  const [splitPct, setSplitPct] = useState(46);
  const [mobilePane, setMobilePane] = useState<'original' | 'texto'>('texto');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const savedFingerprint = useRef(
    fingerprint(
      initialAct.assunto ?? '',
      toDateInputValue(initialAct.dataAto),
      initialAct.orgaoOrigemId ?? '',
      initialAct.units,
    ),
  );

  const editable =
    act.statusPublicacao !== 'publicado' || Boolean(act.editionOpen);
  const dirty =
    fingerprint(assunto, dataAto, orgaoId, units) !== savedFingerprint.current;

  useEffect(() => {
    listOrgans(false)
      .then((list) => {
        setOrgans(list);
        if (
          initialAct.orgaoOrigemId &&
          !list.some((o) => o.id === initialAct.orgaoOrigemId)
        ) {
          setOrgans((prev) => [
            ...prev,
            {
              id: initialAct.orgaoOrigemId!,
              nome: initialAct.orgaoOrigem ?? 'Órgão inativo',
              ativo: false,
            },
          ]);
        }
      })
      .catch(() => undefined);
  }, [initialAct.orgaoOrigem, initialAct.orgaoOrigemId]);

  useEffect(() => {
    listActAttachments(act.id)
      .then((bundle) => setOriginalFile(bundle.original))
      .catch(() => undefined);
  }, [act.id]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const tituloFormalPreview = formatFormalTitle(
    act.tipo,
    act.numero,
    dataAto ? new Date(dataAto).getUTCFullYear() || act.ano : act.ano,
    dataAto || null,
  );

  const hierarchy = useMemo(() => assessUnitsHierarchy(units), [units]);
  const hierarchyValid = hierarchy.structurallySound;

  const metaPayload = () => ({
    ementa: resolveActEmenta(units, act.ementa) || 'Ementa pendente',
    assunto,
    dataAto: dataAto || undefined,
    orgaoOrigemId: orgaoId || undefined,
  });

  const syncFromAct = (updated: EditorAct) => {
    setAct(updated);
    setUnits(updated.units);
    setAssunto(updated.assunto ?? '');
    setDataAto(toDateInputValue(updated.dataAto));
    setOrgaoId(updated.orgaoOrigemId ?? '');
    savedFingerprint.current = fingerprint(
      updated.assunto ?? '',
      toDateInputValue(updated.dataAto),
      updated.orgaoOrigemId ?? '',
      updated.units,
    );
  };

  const moveUnit = (index: number, direction: -1 | 1) => {
    if (!editable) return;
    const next = moveUnitBlock(units, index, direction);
    if (next !== units) setUnits(next);
  };

  const canMove = (index: number, direction: -1 | 1) => {
    if (!editable) return false;
    const next = moveUnitBlock(units, index, direction);
    return next !== units;
  };

  const onDragStart = (index: number) => {
    if (!editable) return;
    setDragIndex(index);
  };

  const onDrop = (index: number) => {
    if (!editable || dragIndex === null || dragIndex === index) return;
    setUnits(dragDropBlock(units, dragIndex, index));
    setDragIndex(null);
  };

  const updateUnitText = (id: string, texto: string) => {
    if (!editable) return;
    setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, texto } : u)));
  };

  const toggleCollapsed = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openAddDialog = (ctx: AddContext = { mode: 'end' }) => {
    setAddContext(ctx);
    setAddDialogOpen(true);
  };

  const updateUnitEffects = (unitId: string, effects: LegislativeEffect[]) => {
    setUnits((prev) =>
      prev.map((u) => (u.id === unitId ? { ...u, efeitosLegislativos: effects } : u)),
    );
  };

  const childUnitsForRedacao = (unitId: string) =>
    units.filter((u) => u.parentUnitId === unitId);

  const handleAddUnit = async (payload: {
    tipoUnidade: UnitType;
    identificacao?: string;
    texto?: string;
    parentUnitId?: string | null;
    afterUnitId?: string | null;
    formatacao?: UnitFormatacao | null;
  }) => {
    try {
      const updated = await addUnit(act.id, {
        tipoUnidade: payload.tipoUnidade,
        identificacao: payload.identificacao,
        texto: payload.texto ?? '',
        parentUnitId: payload.parentUnitId ?? null,
        afterUnitId: payload.afterUnitId ?? null,
        formatacao: payload.formatacao ?? null,
      });
      syncFromAct(updated);
      toast('Elemento adicionado', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao adicionar', 'danger');
    }
  };

  const updateUnitFormatacao = (id: string, patch: Partial<UnitFormatacao>) => {
    if (!editable) return;
    setUnits((prev) =>
      prev.map((u) =>
        u.id === id
          ? {
              ...u,
              formatacao: {
                ...(u.formatacao ?? DEFAULT_TEXTO_SIMPLES_FORMAT),
                ...patch,
              },
            }
          : u,
      ),
    );
  };

  const applyUnitEdit = (patch: {
    tipoUnidade: UnitType;
    identificacao: string | null;
    texto: string;
    parentUnitId: string | null;
    formatacao?: UnitFormatacao | null;
  }) => {
    if (!editUnit) return;
    setUnits((prev) =>
      prev.map((u) =>
        u.id === editUnit.id
          ? {
              ...u,
              tipoUnidade: patch.tipoUnidade,
              identificacao: patch.identificacao,
              texto: patch.texto,
              parentUnitId: patch.parentUnitId,
              formatacao: patch.formatacao ?? null,
            }
          : u,
      ),
    );
    toast('Elemento atualizado — salve as alterações para gravar', 'ok');
  };

  const handleDeleteUnit = async (opts: {
    mode: 'cascade' | 'reparent';
    newParentId?: string | null;
    confirmEffectCleanup?: boolean;
  }) => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const updated = await deleteUnit(act.id, deleteTarget.id, opts);
      syncFromAct(updated);
      setDeleteTarget(null);
      toast('Elemento excluído', 'ok');
    } catch (e) {
      throw e instanceof Error ? e : new Error('Erro ao excluir');
    } finally {
      setDeleting(false);
    }
  };

  const persistUnits = useCallback(async () => {
    const updated = await saveUnits(act.id, unitsPayload(units));
    const allEffects: LegislativeEffect[] = units.flatMap((u) =>
      (u.efeitosLegislativos ?? []).map((e) => ({ ...e, sourceUnitId: u.id })),
    );
    const withEffects = await saveLegislativeEffects(act.id, allEffects);
    return withEffects;
  }, [act.id, units]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAct(act.id, metaPayload());
      const updated = await persistUnits();
      syncFromAct(updated);
      toast('Alterações salvas', 'ok');
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
      await updateAct(act.id, metaPayload());
      await persistUnits();
      const updated = await submitForReview(act.id);
      syncFromAct(updated);
      toast(
        act.editionOpen ? 'Versão pronta para publicação' : 'Enviado para revisão',
        'ok',
      );
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
      if (editable && dirty) {
        await updateAct(act.id, metaPayload());
        await persistUnits();
      }
      const updated = await publishAct(act.id);
      syncFromAct(updated);
      toast('Ato publicado no portal', 'ok');
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao publicar', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateEdition = async () => {
    if (dirty && !window.confirm('Há alterações não salvas que serão descartadas. Continuar?')) {
      return;
    }
    setSaving(true);
    try {
      const updated = await createActEdition(act.id);
      syncFromAct(updated);
      toast('Nova versão de trabalho criada — a consulta pública permanece inalterada', 'ok');
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao criar versão', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreVersion = async (unitId: string, versionId: string) => {
    if (!versionId) return;
    setSaving(true);
    try {
      const updated = await restoreUnitVersion(act.id, unitId, versionId);
      syncFromAct(updated);
      toast('Versão anterior restaurada', 'ok');
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao restaurar versão', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const confirmLeave = () => {
    if (dirty && !window.confirm('Há alterações não salvas. Deseja sair mesmo assim?')) {
      return false;
    }
    return true;
  };

  const statusLabel: Record<string, string> = {
    rascunho: 'Rascunho',
    em_revisao: 'Em revisão',
    publicado: 'Publicado',
  };

  const canPublish =
    can('acts:publish') &&
    (act.statusPublicacao === 'em_revisao' ||
      (act.statusPublicacao === 'publicado' && Boolean(act.editionOpen)));

  return (
    <>
      <AdminTopbar
        title="Editor de texto estruturado"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {dirty && (
              <Badge variant="warn" className="text-[11px]">
                Alterações não salvas
              </Badge>
            )}
            <Link
              href="/admin/atos"
              onClick={(e) => {
                if (!confirmLeave()) e.preventDefault();
              }}
            >
              <Button variant="ghost" size="sm">
                Voltar
              </Button>
            </Link>
            {can('acts:history') && (
              <Link href={`/admin/atos/${act.id}/historico`}>
                <Button variant="ghost" size="sm">
                  <History className="h-3.5 w-3.5" />
                  Histórico interno
                </Button>
              </Link>
            )}
            <CompareModeToggle
              active={compareMode}
              hasOriginal={Boolean(originalFile)}
              onToggle={() => {
                if (!originalFile) {
                  toast(
                    'Anexe o arquivo original do ato nos Metadados para habilitar a comparação',
                    'warn',
                  );
                  return;
                }
                setCompareMode(true);
                setMobilePane('texto');
              }}
              onExit={() => setCompareMode(false)}
            />
            {can('acts:version') &&
              act.statusPublicacao === 'publicado' &&
              !act.editionOpen && (
                <Button size="sm" onClick={handleCreateEdition} disabled={saving}>
                  Criar nova versão
                </Button>
              )}
            {can('acts:write') && editable && (
              <Button variant="outlined" size="sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            )}
            {can('acts:write') && editable && act.statusPublicacao !== 'publicado' && (
              <Button variant="tonal" size="sm" onClick={handleSubmitReview} disabled={saving}>
                Enviar para revisão
              </Button>
            )}
            {canPublish && (
              <Button size="sm" onClick={handlePublish} disabled={saving}>
                {act.editionOpen ? 'Publicar nova versão' : 'Publicar'}
              </Button>
            )}
          </div>
        }
      />

      {act.statusPublicacao === 'publicado' && !act.editionOpen && (
        <div className="mx-6 mt-4 rounded-[10px] border border-line bg-surface-2 px-4 py-3 text-[13px] text-ink-2">
          Este ato está publicado. A consulta pública exibe a versão oficial. Para corrigir
          conteúdo ou metadados, use <strong>Criar nova versão</strong> — a versão pública não
          será alterada até a publicação da correção.
        </div>
      )}
      {act.editionOpen && (
        <div className="mx-6 mt-4 rounded-[10px] border border-brand/30 bg-brand/5 px-4 py-3 text-[13px] text-ink-2">
          Você está editando uma <strong>versão de trabalho</strong>. A consulta pública continua
          exibindo a última versão publicada até você publicar esta correção.
        </div>
      )}

      <div
        className={cn(
          'grid flex-1 gap-6 overflow-auto p-6',
          compareMode ? 'lg:grid-cols-1' : 'lg:grid-cols-[340px_1fr]',
        )}
      >
        {!compareMode && (
        <section className="space-y-4 rounded-[14px] border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-section">Metadados</h2>
            <div className="flex flex-wrap gap-1">
              <Badge variant="info">
                {statusLabel[act.statusPublicacao ?? 'rascunho'] ?? act.statusPublicacao}
              </Badge>
              {act.editionOpen && <Badge variant="warn">Versão de trabalho</Badge>}
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[12px] text-ink-3">Tipo</label>
              <Input value={ACT_TYPE_LABELS[act.tipo]} readOnly />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[12px] text-ink-3">Número</label>
                <Input value={act.numero} readOnly />
              </div>
              <div>
                <label className="mb-1 block text-[12px] text-ink-3">Ano</label>
                <Input value={act.ano} readOnly />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[12px] text-ink-3">Data do ato</label>
              <Input
                type="date"
                value={dataAto}
                onChange={(e) => setDataAto(e.target.value)}
                disabled={!editable}
              />
              <p className="mt-1 text-[11px] text-ink-4">
                Gera o título formal automaticamente. O ano pode ser preenchido a partir desta data.
              </p>
            </div>
            <div className="rounded-[10px] border border-line-2 bg-surface-2 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-ink-4">Título formal</p>
              <p className="mt-0.5 text-[13px] font-semibold uppercase text-ink">
                {tituloFormalPreview}
              </p>
            </div>
            <div className="rounded-[10px] border border-dashed border-line px-3 py-2 text-[12.5px] text-ink-3">
              A ementa oficial é cadastrada no Texto Estruturado (grupo Texto → Ementa), não nos
              metadados.
            </div>
            <div>
              <label className="mb-1 block text-[12px] text-ink-3">Assunto</label>
              <Input
                value={assunto}
                onChange={(e) => setAssunto(e.target.value)}
                disabled={!editable}
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] text-ink-3">Órgão de origem</label>
              <Select
                value={orgaoId}
                onChange={(e) => setOrgaoId(e.target.value)}
                disabled={!editable}
              >
                <option value="">Selecione…</option>
                {organs
                  .filter((o) => o.ativo || o.id === orgaoId)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nome}
                      {!o.ativo ? ' (inativo)' : ''}
                    </option>
                  ))}
              </Select>
            </div>
            <ActMetadataAttachments
              actId={act.id}
              editable={editable && can('acts:write')}
              onOriginalChange={setOriginalFile}
            />
          </div>
        </section>
        )}

        {compareMode && originalFile && (
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1 rounded-[10px] border border-line p-0.5 lg:hidden">
              <button
                type="button"
                onClick={() => setMobilePane('original')}
                className={cn(
                  'rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold',
                  mobilePane === 'original' ? 'bg-brand-soft text-brand' : 'text-ink-3',
                )}
              >
                Arquivo original
              </button>
              <button
                type="button"
                onClick={() => setMobilePane('texto')}
                className={cn(
                  'rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold',
                  mobilePane === 'texto' ? 'bg-brand-soft text-brand' : 'text-ink-3',
                )}
              >
                Texto estruturado
              </button>
            </div>
            <label className="hidden items-center gap-2 text-[12px] text-ink-3 lg:flex">
              Largura do original
              <input
                type="range"
                min={28}
                max={70}
                value={splitPct}
                onChange={(e) => setSplitPct(Number(e.target.value))}
                className="w-36"
              />
            </label>
          </div>
        )}

        <div
          className={cn(
            compareMode && originalFile && 'flex flex-col gap-3 lg:flex-row lg:items-stretch',
          )}
        >
          {compareMode && originalFile && (
            <div
              className={cn('min-w-0', mobilePane !== 'original' && 'max-lg:hidden')}
              style={{ flex: `0 0 ${splitPct}%` }}
            >
              <OriginalFilePane actId={act.id} attachment={originalFile} />
            </div>
          )}
          <div
            className={cn(
              'min-w-0',
              compareMode && originalFile && 'flex-1 overflow-y-auto',
              compareMode && originalFile && mobilePane !== 'texto' && 'max-lg:hidden',
            )}
            style={
              compareMode && originalFile
                ? { maxHeight: 'min(72vh, 900px)' }
                : undefined
            }
          >
        <section className="rounded-[14px] border border-line bg-surface p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-section">Texto estruturado</h2>
            <div
              className={cn(
                'flex items-center gap-2 text-[12.5px] font-semibold',
                !hierarchyValid
                  ? 'text-danger'
                  : hierarchy.hasNonstandardLinks
                    ? 'text-warn'
                    : 'text-ok',
              )}
            >
              {!hierarchyValid ? (
                <AlertCircle className="h-4 w-4" />
              ) : hierarchy.hasNonstandardLinks ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {!hierarchyValid
                ? 'Estrutura inconsistente — revise vínculos'
                : hierarchy.hasNonstandardLinks
                  ? 'Estrutura atípica permitida (ato fiel)'
                  : 'Hierarquia íntegra'}
            </div>
          </div>
          {hierarchy.warnings.length > 0 && (
            <p className="mb-3 text-[12px] text-ink-3">{hierarchy.warnings[0]}</p>
          )}

          <div className="space-y-1.5">
            {units.map((unit, index) => {
              if (isCollapsedAway(unit, units, collapsed)) return null;
              const childCount = units.filter((u) => u.parentUnitId === unit.id).length;
              const canToggle = hasChildren(unit.id, units);
              const isOpen = !collapsed.has(unit.id);
              const indent = unitIndentPx(unit, units);

              return (
                <div
                  key={unit.id}
                  draggable={editable}
                  onDragStart={() => onDragStart(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(index)}
                  style={{ marginLeft: indent }}
                  className={cn(
                    'flex items-start gap-2 rounded-[10px] border border-line-2 bg-surface-2 p-3 transition',
                    dragIndex === index && 'opacity-50',
                  )}
                >
                  {canToggle ? (
                    <button
                      type="button"
                      onClick={() => toggleCollapsed(unit.id)}
                      className="mt-0.5 shrink-0 rounded p-0.5 text-ink-4 hover:bg-surface hover:text-brand"
                      aria-label={isOpen ? 'Recolher subordinados' : 'Expandir subordinados'}
                      title={isOpen ? 'Recolher' : 'Expandir'}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  ) : (
                    <span className="mt-0.5 inline-block w-5 shrink-0" />
                  )}
                  <GripVertical className="mt-1 h-4 w-4 shrink-0 cursor-grab text-ink-4" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12px] font-semibold text-brand">
                        {unit.identificacao ?? UNIT_TYPE_LABELS[unit.tipoUnidade]}
                      </span>
                      <Badge variant="neutral" className="text-[10px]">
                        {UNIT_TYPE_LABELS[unit.tipoUnidade]}
                      </Badge>
                      {editable && can('acts:write') && (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditUnit(unit)}
                            className="touch-target rounded p-1 text-ink-4 hover:bg-surface hover:text-brand"
                            aria-label="Editar identificação, tipo e vínculo"
                            title="Editar identificação, tipo e vínculo"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(unit)}
                            className="touch-target rounded p-1 text-ink-4 hover:bg-surface hover:text-danger"
                            aria-label="Excluir elemento"
                            title="Excluir elemento"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
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
                      {unit.parentUnitId && (
                        <span className="text-[11px] text-ink-4">
                          ↳ {parentLabel(units, unit.parentUnitId)}
                        </span>
                      )}
                      {canToggle && !isOpen && (
                        <span className="text-[11px] text-ink-4">
                          ({childCount} subordinado{childCount === 1 ? '' : 's'} oculto
                          {childCount === 1 ? '' : 's'})
                        </span>
                      )}
                    </div>

                    <UnitTextEditor
                      value={unit.texto}
                      onChange={(html) => updateUnitText(unit.id, html)}
                      disabled={!editable}
                      rows={unit.tipoUnidade === 'artigo' || unit.tipoUnidade === 'preambulo' ? 3 : 2}
                    />
                    {unit.tipoUnidade === 'texto_simples' && editable && (
                      <div className="space-y-2 rounded-[8px] border border-line bg-surface px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">
                          Formatação
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Select
                            value={unit.formatacao?.align ?? 'center'}
                            onChange={(e) =>
                              updateUnitFormatacao(unit.id, {
                                align: e.target.value as TextAlign,
                              })
                            }
                            className="text-[12px]"
                          >
                            <option value="left">Esquerda</option>
                            <option value="center">Centralizado</option>
                            <option value="right">Direita</option>
                            <option value="justify">Justificado</option>
                          </Select>
                          <Select
                            value={unit.formatacao?.letterSpacing ?? 'normal'}
                            onChange={(e) =>
                              updateUnitFormatacao(unit.id, {
                                letterSpacing: e.target.value as LetterSpacing,
                              })
                            }
                            className="text-[12px]"
                          >
                            <option value="normal">Espaçamento normal</option>
                            <option value="expanded">Espaçamento expandido</option>
                          </Select>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {(
                            [
                              ['bold', 'Negrito'],
                              ['italic', 'Itálico'],
                              ['underline', 'Sublinhado'],
                            ] as const
                          ).map(([key, label]) => (
                            <label
                              key={key}
                              className="inline-flex items-center gap-1.5 text-[12px] text-ink-2"
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(unit.formatacao?.[key])}
                                onChange={(e) =>
                                  updateUnitFormatacao(unit.id, { [key]: e.target.checked })
                                }
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    {can('acts:write') &&
                      editable &&
                      !NON_EFFECT_SOURCE_TYPES.includes(unit.tipoUnidade) && (
                        <LegislativeEffectsSection
                          unitId={unit.id}
                          actId={act.id}
                          effects={unit.efeitosLegislativos ?? []}
                          onChange={(effects) => updateUnitEffects(unit.id, effects)}
                          redacaoChildUnits={childUnitsForRedacao(unit.id)}
                        />
                      )}
                    {can('acts:write') && editable && unit.versoes.length > 1 && (
                      <Select
                        defaultValue=""
                        onChange={(e) => {
                          const versionId = e.target.value;
                          if (versionId) handleRestoreVersion(unit.id, versionId);
                          e.target.value = '';
                        }}
                        className="text-[12px]"
                      >
                        <option value="">Restaurar versão anterior…</option>
                        {unit.versoes.map((v) => (
                          <option key={v.id} value={v.id}>
                            {new Date(v.validoDe).toLocaleDateString('pt-BR')}
                            {v.validoAte
                              ? ` — ${new Date(v.validoAte).toLocaleDateString('pt-BR')}`
                              : ' — atual'}
                          </option>
                        ))}
                      </Select>
                    )}
                    {can('acts:write') && editable && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            openAddDialog({ mode: 'inside', anchorId: unit.id })
                          }
                          className="inline-flex items-center gap-1 rounded-[8px] border border-line bg-surface px-2 py-1 text-[11px] font-medium text-brand hover:bg-brand-soft"
                        >
                          <Plus className="h-3 w-3" />
                          Dentro
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            openAddDialog({ mode: 'after', anchorId: unit.id })
                          }
                          className="inline-flex items-center gap-1 rounded-[8px] border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink-2 hover:bg-surface-2"
                        >
                          <Plus className="h-3 w-3" />
                          Após
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => moveUnit(index, -1)}
                      disabled={!canMove(index, -1)}
                      className="touch-target rounded p-1.5 text-ink-4 hover:bg-surface hover:text-brand disabled:opacity-30"
                      aria-label="Mover bloco para cima"
                      title="Move o elemento e toda a subárvore"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveUnit(index, 1)}
                      disabled={!canMove(index, 1)}
                      className="touch-target rounded p-1.5 text-ink-4 hover:bg-surface hover:text-brand disabled:opacity-30"
                      aria-label="Mover bloco para baixo"
                      title="Move o elemento e toda a subárvore"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {can('acts:write') && editable && (
            <Button
              variant="tonal"
              size="sm"
              className="mt-4"
              onClick={() => openAddDialog({ mode: 'end' })}
            >
              <Plus className="h-4 w-4" />
              Adicionar elemento
            </Button>
          )}

        </section>
          </div>
        </div>
      </div>

      <AddUnitDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        units={units}
        context={addContext}
        onConfirm={handleAddUnit}
      />
      <EditUnitDialog
        open={Boolean(editUnit)}
        unit={editUnit}
        units={units}
        onClose={() => setEditUnit(null)}
        onSave={applyUnitEdit}
      />
      <DeleteUnitDialog
        open={Boolean(deleteTarget)}
        unit={deleteTarget}
        units={units}
        busy={deleting}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleDeleteUnit}
      />
    </>
  );
}
