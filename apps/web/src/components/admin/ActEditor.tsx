'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
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
  DEFAULT_COMPARE_PANEL_HEIGHT,
  MAX_COMPARE_PANEL_HEIGHT,
  MIN_COMPARE_PANEL_HEIGHT,
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
  listPublicationMedia,
  listSignatories,
  publishAct,
  restoreUnitVersion,
  saveLegislativeEffects,
  saveUnits,
  startActStructuring,
  submitForReview,
  updateAct,
  type AdminSignatory,
  type OriginOrg,
  type PublicationMedium,
  type UnitPayload,
} from '@/lib/admin-api';
import { LegislativeEffectsSection } from '@/components/admin/LegislativeEffectsSection';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';
import { AuthError } from '@/lib/api';
import {
  clearEditorDraft,
  loadEditorDraft,
  saveEditorDraft,
} from '@/lib/editor-draft';
import {
  ACT_TYPE_LABELS,
  actUrl,
  cn,
  ETAPA_EDITORIAL_LABELS,
  formatFormalTitle,
  resolveTituloPrefixo,
  toDateInputValue,
  type EditorialStage,
} from '@/lib/format';
import { forceRefreshAccessToken } from '@/lib/auth-session';
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

type PrefixoTituloModo = 'none' | 'auto' | 'manual';

type ActSignatoryDraft = {
  signatoryId?: string | null;
  nome: string;
  cargo: string;
  ordem: number;
};

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

function initialOrgaoIds(act: EditorAct): string[] {
  if (act.orgaosOrigem?.length) {
    return [...act.orgaosOrigem]
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .map((o) => o.id);
  }
  return act.orgaoOrigemId ? [act.orgaoOrigemId] : [];
}

function initialSignatories(act: EditorAct): ActSignatoryDraft[] {
  return (act.signatarios ?? [])
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map((s, i) => ({
      signatoryId: s.signatoryId ?? null,
      nome: s.nome,
      cargo: s.cargo,
      ordem: i,
    }));
}

type MetaFingerprint = {
  assunto: string;
  dataAto: string;
  dataPublicacao: string;
  meioPublicacaoId: string;
  orgaoOrigemIds: string[];
  atoConjunto: boolean;
  prefixoTituloModo: PrefixoTituloModo;
  prefixoTitulo: string;
  signatories: ActSignatoryDraft[];
  units: NormativeUnit[];
};

function fingerprint(meta: MetaFingerprint) {
  return JSON.stringify({
    assunto: meta.assunto,
    dataAto: meta.dataAto,
    dataPublicacao: meta.dataPublicacao,
    meioPublicacaoId: meta.meioPublicacaoId,
    orgaoOrigemIds: meta.orgaoOrigemIds,
    atoConjunto: meta.atoConjunto,
    prefixoTituloModo: meta.prefixoTituloModo,
    prefixoTitulo: meta.prefixoTitulo,
    signatories: meta.signatories,
    units: unitsPayload(meta.units),
    effects: meta.units.map((u) => ({
      id: u.id,
      effects: u.efeitosLegislativos ?? [],
    })),
  });
}

function metaFromAct(act: EditorAct, units: NormativeUnit[]): MetaFingerprint {
  return {
    assunto: act.assunto ?? '',
    dataAto: toDateInputValue(act.dataAto),
    dataPublicacao: toDateInputValue(act.dataPublicacao),
    meioPublicacaoId: act.meioPublicacaoId ?? act.meioPublicacao?.id ?? '',
    orgaoOrigemIds: initialOrgaoIds(act),
    atoConjunto: Boolean(act.atoConjunto),
    prefixoTituloModo: (act.prefixoTituloModo as PrefixoTituloModo) || 'none',
    prefixoTitulo: act.prefixoTitulo ?? '',
    signatories: initialSignatories(act),
    units,
  };
}

export function ActEditor({ initialAct }: { initialAct: EditorAct }) {
  const router = useRouter();
  const { toast } = useToast();
  const { can } = useAdminAuth();
  const [act, setAct] = useState(initialAct);
  const [units, setUnits] = useState<NormativeUnit[]>(initialAct.units);
  const [assunto, setAssunto] = useState(initialAct.assunto ?? '');
  const [dataAto, setDataAto] = useState(toDateInputValue(initialAct.dataAto));
  const [dataPublicacao, setDataPublicacao] = useState(
    toDateInputValue(initialAct.dataPublicacao),
  );
  const [meioPublicacaoId, setMeioPublicacaoId] = useState(
    initialAct.meioPublicacaoId ?? initialAct.meioPublicacao?.id ?? '',
  );
  const [orgaoOrigemIds, setOrgaoOrigemIds] = useState<string[]>(() =>
    initialOrgaoIds(initialAct),
  );
  const [atoConjunto, setAtoConjunto] = useState(Boolean(initialAct.atoConjunto));
  const [prefixoTituloModo, setPrefixoTituloModo] = useState<PrefixoTituloModo>(
    (initialAct.prefixoTituloModo as PrefixoTituloModo) || 'none',
  );
  const [prefixoTitulo, setPrefixoTitulo] = useState(initialAct.prefixoTitulo ?? '');
  const [signatories, setSignatories] = useState<ActSignatoryDraft[]>(() =>
    initialSignatories(initialAct),
  );
  const [organs, setOrgans] = useState<OriginOrg[]>([]);
  const [publicationMedia, setPublicationMedia] = useState<PublicationMedium[]>([]);
  const [signatoryCatalog, setSignatoryCatalog] = useState<AdminSignatory[]>([]);
  const [addOrgaoId, setAddOrgaoId] = useState('');
  const [addSignatoryId, setAddSignatoryId] = useState('');
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
  const [panelHeight, setPanelHeight] = useState(DEFAULT_COMPARE_PANEL_HEIGHT);
  const [mobilePane, setMobilePane] = useState<'original' | 'texto'>('texto');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const currentMeta = (): MetaFingerprint => ({
    assunto,
    dataAto,
    dataPublicacao,
    meioPublicacaoId,
    orgaoOrigemIds,
    atoConjunto,
    prefixoTituloModo,
    prefixoTitulo,
    signatories,
    units,
  });

  const savedFingerprint = useRef(fingerprint(metaFromAct(initialAct, initialAct.units)));

  const editable =
    act.statusPublicacao !== 'publicado' || Boolean(act.editionOpen);
  const dirty = fingerprint(currentMeta()) !== savedFingerprint.current;

  useEffect(() => {
    listOrgans(false)
      .then((list) => {
        const linked = initialOrgaoIds(initialAct);
        const extras = (initialAct.orgaosOrigem ?? [])
          .filter((o) => !list.some((l) => l.id === o.id))
          .map((o) => ({
            id: o.id,
            nome: o.nome,
            sigla: o.sigla ?? null,
            ativo: false,
          }));
        if (
          initialAct.orgaoOrigemId &&
          !list.some((o) => o.id === initialAct.orgaoOrigemId) &&
          !extras.some((o) => o.id === initialAct.orgaoOrigemId)
        ) {
          extras.push({
            id: initialAct.orgaoOrigemId,
            nome: initialAct.orgaoOrigem ?? 'Órgão inativo',
            sigla: null,
            ativo: false,
          });
        }
        setOrgans([...list, ...extras]);
        void linked;
      })
      .catch(() => undefined);
  }, [initialAct]);

  useEffect(() => {
    listPublicationMedia(false)
      .then((list) => {
        const linkedId = initialAct.meioPublicacaoId ?? initialAct.meioPublicacao?.id;
        if (
          linkedId &&
          initialAct.meioPublicacao &&
          !list.some((m) => m.id === linkedId)
        ) {
          setPublicationMedia([
            ...list,
            {
              id: initialAct.meioPublicacao.id,
              nome: initialAct.meioPublicacao.nome,
              ativo: false,
            },
          ]);
        } else {
          setPublicationMedia(list);
        }
      })
      .catch(() => undefined);
  }, [initialAct.meioPublicacao, initialAct.meioPublicacaoId]);

  useEffect(() => {
    listSignatories(false)
      .then(setSignatoryCatalog)
      .catch(() => undefined);
  }, []);

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

  const selectedOrgs = orgaoOrigemIds
    .map((id) => organs.find((o) => o.id === id))
    .filter((o): o is OriginOrg => Boolean(o));

  const resolvedPrefixo = resolveTituloPrefixo(
    prefixoTituloModo,
    prefixoTitulo,
    selectedOrgs,
  );

  const tituloFormalPreview = formatFormalTitle(
    act.tipo,
    act.numero,
    dataAto ? new Date(dataAto).getUTCFullYear() || act.ano : act.ano,
    dataAto || null,
    { atoConjunto, prefixo: resolvedPrefixo },
  );

  const hierarchy = useMemo(() => assessUnitsHierarchy(units), [units]);
  const hierarchyValid = hierarchy.structurallySound;

  const metaPayload = () => ({
    ementa: resolveActEmenta(units, act.ementa) || 'Ementa pendente',
    assunto,
    dataAto: dataAto || undefined,
    dataPublicacao: dataPublicacao || null,
    meioPublicacaoId: meioPublicacaoId || null,
    orgaoOrigemIds,
    atoConjunto,
    prefixoTituloModo,
    prefixoTitulo: prefixoTituloModo === 'manual' ? prefixoTitulo.trim() || null : null,
    signatories: signatories.map((s, i) => ({
      signatoryId: s.signatoryId || null,
      nome: s.nome,
      cargo: s.cargo,
      ordem: i,
    })),
  });

  const syncFromAct = (updated: EditorAct) => {
    setAct(updated);
    setUnits(updated.units);
    setAssunto(updated.assunto ?? '');
    setDataAto(toDateInputValue(updated.dataAto));
    setDataPublicacao(toDateInputValue(updated.dataPublicacao));
    setMeioPublicacaoId(updated.meioPublicacaoId ?? updated.meioPublicacao?.id ?? '');
    setOrgaoOrigemIds(initialOrgaoIds(updated));
    setAtoConjunto(Boolean(updated.atoConjunto));
    setPrefixoTituloModo((updated.prefixoTituloModo as PrefixoTituloModo) || 'none');
    setPrefixoTitulo(updated.prefixoTitulo ?? '');
    setSignatories(initialSignatories(updated));
    savedFingerprint.current = fingerprint(metaFromAct(updated, updated.units));
  };

  const moveOrgao = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= orgaoOrigemIds.length) return;
    setOrgaoOrigemIds((ids) => {
      const copy = [...ids];
      const tmp = copy[index];
      copy[index] = copy[next];
      copy[next] = tmp;
      return copy;
    });
  };

  const addOrgao = () => {
    if (!addOrgaoId || orgaoOrigemIds.includes(addOrgaoId)) return;
    setOrgaoOrigemIds((ids) => {
      const next = [...ids, addOrgaoId];
      if (next.length > 1) setAtoConjunto(true);
      return next;
    });
    setAddOrgaoId('');
  };

  const moveSignatory = (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= signatories.length) return;
    setSignatories((list) => {
      const copy = [...list];
      const tmp = copy[index];
      copy[index] = copy[next];
      copy[next] = tmp;
      return copy.map((s, i) => ({ ...s, ordem: i }));
    });
  };

  const addSignatoryFromCatalog = () => {
    if (!addSignatoryId) return;
    const src = signatoryCatalog.find((s) => s.id === addSignatoryId);
    if (!src) return;
    setSignatories((list) => [
      ...list,
      {
        signatoryId: src.id,
        nome: src.nome,
        cargo: src.cargo,
        ordem: list.length,
      },
    ]);
    setAddSignatoryId('');
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

  const onDragStart = (index: number, e: ReactDragEvent) => {
    if (!editable) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
    setDragIndex(index);
  };

  const onDragEnd = () => {
    setDragIndex(null);
  };

  const onDrop = (index: number) => {
    if (!editable || dragIndex === null) {
      setDragIndex(null);
      return;
    }
    if (dragIndex !== index) {
      setUnits(dragDropBlock(units, dragIndex, index));
    }
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

  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'unsaved' | 'saving' | 'autosaving' | 'saved' | 'error'
  >('idle');

  const persistDraftLocal = useCallback(() => {
    if (!editable) return;
    saveEditorDraft({
      actId: act.id,
      savedAt: new Date().toISOString(),
      assunto,
      dataAto,
      dataPublicacao,
      meioPublicacaoId,
      orgaoOrigemIds,
      atoConjunto,
      prefixoTituloModo,
      prefixoTitulo,
      signatories,
      units,
    });
  }, [
    editable,
    act.id,
    assunto,
    dataAto,
    dataPublicacao,
    meioPublicacaoId,
    orgaoOrigemIds,
    atoConjunto,
    prefixoTituloModo,
    prefixoTitulo,
    signatories,
    units,
  ]);

  const handleSave = async (opts?: { silent?: boolean; auto?: boolean }) => {
    const silent = Boolean(opts?.silent);
    const auto = Boolean(opts?.auto);
    setSaving(true);
    setSaveStatus(auto ? 'autosaving' : 'saving');
    try {
      await updateAct(act.id, metaPayload());
      const updated = await persistUnits();
      syncFromAct(updated);
      clearEditorDraft(act.id);
      setSaveStatus('saved');
      if (!silent) {
        toast(auto ? 'Salvo automaticamente' : 'Alterações salvas', 'ok');
        if (!auto) router.refresh();
      }
    } catch (e) {
      persistDraftLocal();
      if (e instanceof AuthError) {
        const token = await forceRefreshAccessToken();
        if (token) {
          try {
            await updateAct(act.id, metaPayload());
            const updated = await persistUnits();
            syncFromAct(updated);
            clearEditorDraft(act.id);
            setSaveStatus('saved');
            if (!silent) toast('Alterações salvas', 'ok');
            return;
          } catch {
            /* fall through */
          }
        }
        setSaveStatus('error');
        toast(
          'Não foi possível salvar: sessão expirada. Seu trabalho foi preservado nesta tela — entre novamente e use Recuperar rascunho se necessário.',
          'danger',
        );
        return;
      }
      setSaveStatus('error');
      toast(e instanceof Error ? e.message : 'Erro ao salvar — alterações mantidas na tela', 'danger');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (dirty) setSaveStatus('unsaved');
  }, [dirty]);

  useEffect(() => {
    if (!dirty || !editable) return;
    const t = window.setTimeout(() => persistDraftLocal(), 800);
    return () => window.clearTimeout(t);
  }, [dirty, editable, persistDraftLocal]);

  useEffect(() => {
    if (!dirty || !editable || !can('acts:write')) return;
    const t = window.setTimeout(() => {
      void handleSave({ silent: true, auto: true });
    }, 180_000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, editable, assunto, dataAto, units, orgaoOrigemIds]);

  useEffect(() => {
    const draft = loadEditorDraft(act.id);
    if (!draft || !editable) return;
    const serverFp = fingerprint(metaFromAct(act, act.units));
    const draftFp = fingerprint({
      assunto: draft.assunto,
      dataAto: draft.dataAto,
      dataPublicacao: draft.dataPublicacao,
      meioPublicacaoId: draft.meioPublicacaoId,
      orgaoOrigemIds: draft.orgaoOrigemIds,
      atoConjunto: draft.atoConjunto,
      prefixoTituloModo: draft.prefixoTituloModo as PrefixoTituloModo,
      prefixoTitulo: draft.prefixoTitulo,
      signatories: draft.signatories,
      units: draft.units,
    });
    if (draftFp === serverFp) {
      clearEditorDraft(act.id);
      return;
    }
    const ok = window.confirm(
      'Há um rascunho local não salvo deste ato (ex.: após falha de sessão). Deseja recuperá-lo?',
    );
    if (!ok) return;
    setAssunto(draft.assunto);
    setDataAto(draft.dataAto);
    setDataPublicacao(draft.dataPublicacao);
    setMeioPublicacaoId(draft.meioPublicacaoId);
    setOrgaoOrigemIds(draft.orgaoOrigemIds);
    setAtoConjunto(draft.atoConjunto);
    setPrefixoTituloModo((draft.prefixoTituloModo as PrefixoTituloModo) || 'none');
    setPrefixoTitulo(draft.prefixoTitulo);
    setSignatories(draft.signatories);
    setUnits(draft.units);
    setSaveStatus('unsaved');
    toast('Rascunho local recuperado — revise e salve as alterações', 'warn');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act.id]);

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
        if (units.length > 0) {
          await persistUnits();
        }
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
      const fileOnly = updated.etapaEditorial === 'somente_arquivo_original';
      toast(
        fileOnly
          ? 'Versão de trabalho aberta para correção de metadados — a consulta pública permanece inalterada'
          : 'Nova versão de trabalho criada — a consulta pública permanece inalterada',
        'ok',
      );
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao criar versão', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleStartStructuring = async () => {
    if (dirty && !window.confirm('Há alterações não salvas que serão descartadas. Continuar?')) {
      return;
    }
    setSaving(true);
    try {
      const updated = await startActStructuring(act.id);
      syncFromAct(updated);
      toast('Estruturação iniciada — use Comparar com arquivo original para montar o texto', 'ok');
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao iniciar estruturação', 'danger');
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

  const isFileOnlyStage = act.etapaEditorial === 'somente_arquivo_original';
  const canPublish =
    can('acts:publish') &&
    (act.statusPublicacao === 'em_revisao' ||
      (act.statusPublicacao === 'publicado' && Boolean(act.editionOpen)) ||
      (act.statusPublicacao === 'rascunho' && isFileOnlyStage));
  const hasPublicPage =
    act.statusPublicacao === 'publicado' || Boolean(act.editionOpen);
  const publicPortalUrl = act.slug ? actUrl(act.slug) : '/legislacao';

  const saveStatusLabel =
    saveStatus === 'saving'
      ? 'Salvando…'
      : saveStatus === 'autosaving'
        ? 'Salvando automaticamente…'
        : saveStatus === 'saved'
          ? 'Salvo'
          : saveStatus === 'error'
            ? 'Falha ao salvar'
            : saveStatus === 'unsaved' || dirty
              ? 'Alterações não salvas'
              : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AdminTopbar
        sticky
        title="Editor de texto estruturado"
        actions={
          <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
            {saveStatusLabel && (
              <Badge
                variant={
                  saveStatus === 'error'
                    ? 'danger'
                    : saveStatus === 'saved'
                      ? 'ok'
                      : saveStatus === 'saving' || saveStatus === 'autosaving'
                        ? 'info'
                        : 'warn'
                }
                className="text-[11px]"
              >
                {saveStatusLabel}
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
                  <span className="max-sm:sr-only">Histórico interno</span>
                </Button>
              </Link>
            )}
            <Button
              variant="ghost"
              size="sm"
              type="button"
              disabled={!hasPublicPage}
              title={
                !hasPublicPage
                  ? 'Ato ainda não publicado'
                  : act.editionOpen
                    ? 'Abre a última versão publicada (alterações em andamento não aparecem no portal)'
                    : 'Abrir página pública deste ato em nova aba'
              }
              onClick={() => {
                if (!hasPublicPage) return;
                window.open(publicPortalUrl, '_blank', 'noopener,noreferrer');
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="max-sm:sr-only">Ver no portal público</span>
            </Button>
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
              !act.editionOpen &&
              isFileOnlyStage && (
                <Button size="sm" variant="outlined" onClick={() => void handleCreateEdition()} disabled={saving}>
                  Editar metadados
                </Button>
              )}
            {can('acts:write') && isFileOnlyStage && (
              <Button size="sm" variant="tonal" onClick={() => void handleStartStructuring()} disabled={saving}>
                Iniciar estruturação
              </Button>
            )}
            {can('acts:version') &&
              act.statusPublicacao === 'publicado' &&
              !act.editionOpen &&
              !isFileOnlyStage && (
                <Button size="sm" onClick={() => void handleCreateEdition()} disabled={saving}>
                  Criar nova versão
                </Button>
              )}
            {can('acts:write') && editable && (
              <Button
                variant="outlined"
                size="sm"
                onClick={() => void handleSave()}
                disabled={saving}
              >
                {saving && saveStatus !== 'autosaving' ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            )}
            {can('acts:write') &&
              editable &&
              act.statusPublicacao !== 'publicado' &&
              !isFileOnlyStage && (
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

      <div className="min-h-0 flex-1 overflow-auto">
      {act.statusPublicacao === 'publicado' && !act.editionOpen && isFileOnlyStage && (
        <div className="mx-6 mt-4 rounded-[10px] border border-line bg-surface-2 px-4 py-3 text-[13px] text-ink-2">
          Este ato está publicado no estágio <strong>Somente arquivo original</strong>. Para
          corrigir Tipo, Número, datas, órgãos, anexos e demais metadados, use{' '}
          <strong>Editar metadados</strong>. Para montar o Texto Estruturado, use{' '}
          <strong>Iniciar estruturação</strong>. A consulta pública não será alterada até a
          publicação da correção.
        </div>
      )}
      {act.statusPublicacao === 'publicado' && !act.editionOpen && !isFileOnlyStage && (
        <div className="mx-6 mt-4 rounded-[10px] border border-line bg-surface-2 px-4 py-3 text-[13px] text-ink-2">
          Este ato está publicado. A consulta pública exibe a versão oficial. Para corrigir
          conteúdo ou metadados, use <strong>Criar nova versão</strong> — a versão pública não
          será alterada até a publicação da correção.
        </div>
      )}
      {act.editionOpen && isFileOnlyStage && (
        <div className="mx-6 mt-4 rounded-[10px] border border-brand/30 bg-brand/5 px-4 py-3 text-[13px] text-ink-2">
          Você está em uma <strong>versão de trabalho para correção de metadados</strong>. O
          estágio editorial permanece <strong>Somente arquivo original</strong> e o Texto
          Estruturado fica vazio até você usar <strong>Iniciar estruturação</strong>. A consulta
          pública continua exibindo a última versão publicada.
        </div>
      )}
      {act.editionOpen && !isFileOnlyStage && (
        <div className="mx-6 mt-4 rounded-[10px] border border-brand/30 bg-brand/5 px-4 py-3 text-[13px] text-ink-2">
          Você está editando uma <strong>versão de trabalho</strong>. A consulta pública continua
          exibindo a última versão publicada até você publicar esta correção.
        </div>
      )}

      <div
        className={cn(
          'grid gap-6 p-6',
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
              {act.etapaEditorial && (
                <Badge variant={isFileOnlyStage ? 'warn' : 'neutral'}>
                  {ETAPA_EDITORIAL_LABELS[act.etapaEditorial as EditorialStage] ??
                    act.etapaEditorial}
                </Badge>
              )}
              {act.editionOpen && <Badge variant="warn">Versão de trabalho</Badge>}
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[12px] text-ink-3">Tipo</label>
              <Input value={ACT_TYPE_LABELS[act.tipo]} readOnly />
            </div>
            <div>
              <label className="mb-1 block text-[12px] text-ink-3">Número</label>
              <Input value={act.numero} readOnly />
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
                Gera o título formal automaticamente. O ano (
                {dataAto ? new Date(dataAto).getUTCFullYear() || act.ano : act.ano}) é obtido
                automaticamente desta data.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-[12px] text-ink-3">Data de publicação</label>
              <Input
                type="date"
                value={dataPublicacao}
                onChange={(e) => setDataPublicacao(e.target.value)}
                disabled={!editable}
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] text-ink-3">Meio de publicação</label>
              <Select
                value={meioPublicacaoId}
                onChange={(e) => setMeioPublicacaoId(e.target.value)}
                disabled={!editable}
              >
                <option value="">Selecione…</option>
                {publicationMedia
                  .filter((m) => m.ativo || m.id === meioPublicacaoId)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                      {!m.ativo ? ' (inativo)' : ''}
                    </option>
                  ))}
              </Select>
            </div>
            <div className="rounded-[10px] border border-line-2 bg-surface-2 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-ink-4">Título formal</p>
              <p className="mt-0.5 text-[13px] font-semibold uppercase text-ink">
                {tituloFormalPreview}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-[12px] text-ink-3">Prefixo do título</label>
              <Select
                value={prefixoTituloModo}
                onChange={(e) => setPrefixoTituloModo(e.target.value as PrefixoTituloModo)}
                disabled={!editable}
              >
                <option value="none">Nenhum</option>
                <option value="auto">Automático (siglas dos órgãos)</option>
                <option value="manual">Manual</option>
              </Select>
              {prefixoTituloModo === 'manual' && (
                <Input
                  className="mt-2"
                  value={prefixoTitulo}
                  onChange={(e) => setPrefixoTitulo(e.target.value)}
                  disabled={!editable}
                  placeholder="Ex.: SEFAZ/SEMAD"
                />
              )}
              {prefixoTituloModo === 'auto' && resolvedPrefixo && (
                <p className="mt-1 text-[11px] text-ink-4">Prévia: {resolvedPrefixo}</p>
              )}
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
              <label className="mb-1 block text-[12px] text-ink-3">Órgãos de origem</label>
              {orgaoOrigemIds.length === 0 ? (
                <p className="mb-2 text-[12px] text-ink-4">Nenhum órgão selecionado.</p>
              ) : (
                <ul className="mb-2 space-y-1.5">
                  {orgaoOrigemIds.map((id, index) => {
                    const org = organs.find((o) => o.id === id);
                    return (
                      <li
                        key={id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-line bg-surface-2 px-2.5 py-1.5 text-[12.5px]"
                      >
                        <span className="font-medium text-ink">
                          {org?.sigla ? `${org.sigla} — ` : ''}
                          {org?.nome ?? id}
                          {org && !org.ativo ? ' (inativo)' : ''}
                        </span>
                        {editable && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="rounded px-1 text-ink-3 hover:text-brand disabled:opacity-30"
                              disabled={index === 0}
                              onClick={() => moveOrgao(index, -1)}
                              aria-label="Subir órgão"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              className="rounded px-1 text-ink-3 hover:text-brand disabled:opacity-30"
                              disabled={index === orgaoOrigemIds.length - 1}
                              onClick={() => moveOrgao(index, 1)}
                              aria-label="Descer órgão"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              className="rounded px-1 text-danger"
                              onClick={() =>
                                setOrgaoOrigemIds((ids) => ids.filter((x) => x !== id))
                              }
                              aria-label="Remover órgão"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {editable && (
                <div className="flex flex-wrap gap-2">
                  <Select
                    className="min-w-0 flex-1"
                    value={addOrgaoId}
                    onChange={(e) => setAddOrgaoId(e.target.value)}
                  >
                    <option value="">Adicionar órgão…</option>
                    {organs
                      .filter((o) => o.ativo && !orgaoOrigemIds.includes(o.id))
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.sigla ? `${o.sigla} — ${o.nome}` : o.nome}
                        </option>
                      ))}
                  </Select>
                  <Button type="button" size="sm" variant="ghost" onClick={addOrgao} disabled={!addOrgaoId}>
                    <Plus className="h-3.5 w-3.5" />
                    Incluir
                  </Button>
                </div>
              )}
              {orgaoOrigemIds.length > 1 && !atoConjunto && (
                <p className="mt-1.5 text-[11px] text-warn">
                  Há mais de um órgão — considere marcar como ato conjunto.
                </p>
              )}
            </div>
            <label className="flex items-center gap-2 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={atoConjunto}
                onChange={(e) => setAtoConjunto(e.target.checked)}
                disabled={!editable}
                className="h-4 w-4"
              />
              Ato conjunto
            </label>
            <div>
              <label className="mb-1 block text-[12px] text-ink-3">Signatários</label>
              {signatories.length === 0 ? (
                <p className="mb-2 text-[12px] text-ink-4">Nenhum signatário vinculado.</p>
              ) : (
                <ul className="mb-2 space-y-2">
                  {signatories.map((s, index) => (
                    <li
                      key={`${s.signatoryId ?? 'custom'}-${index}`}
                      className="space-y-1.5 rounded-[8px] border border-line bg-surface-2 px-2.5 py-2"
                    >
                      <Input
                        value={s.nome}
                        onChange={(e) =>
                          setSignatories((list) =>
                            list.map((item, i) =>
                              i === index ? { ...item, nome: e.target.value } : item,
                            ),
                          )
                        }
                        disabled={!editable}
                        placeholder="Nome"
                      />
                      <Input
                        value={s.cargo}
                        onChange={(e) =>
                          setSignatories((list) =>
                            list.map((item, i) =>
                              i === index ? { ...item, cargo: e.target.value } : item,
                            ),
                          )
                        }
                        disabled={!editable}
                        placeholder="Cargo"
                      />
                      {editable && (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            className="rounded px-1 text-ink-3 hover:text-brand disabled:opacity-30"
                            disabled={index === 0}
                            onClick={() => moveSignatory(index, -1)}
                            aria-label="Subir signatário"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="rounded px-1 text-ink-3 hover:text-brand disabled:opacity-30"
                            disabled={index === signatories.length - 1}
                            onClick={() => moveSignatory(index, 1)}
                            aria-label="Descer signatário"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="rounded px-1 text-danger"
                            onClick={() =>
                              setSignatories((list) =>
                                list.filter((_, i) => i !== index).map((item, i) => ({
                                  ...item,
                                  ordem: i,
                                })),
                              )
                            }
                            aria-label="Remover signatário"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {editable && (
                <div className="flex flex-wrap gap-2">
                  <Select
                    className="min-w-0 flex-1"
                    value={addSignatoryId}
                    onChange={(e) => setAddSignatoryId(e.target.value)}
                  >
                    <option value="">Adicionar do catálogo…</option>
                    {signatoryCatalog
                      .filter((s) => s.ativo)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nome} — {s.cargo}
                        </option>
                      ))}
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={addSignatoryFromCatalog}
                    disabled={!addSignatoryId}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Incluir
                  </Button>
                </div>
              )}
            </div>
            <ActMetadataAttachments
              actId={act.id}
              editable={editable && can('acts:write')}
              onOriginalChange={setOriginalFile}
              showPublication={Boolean(meioPublicacaoId)}
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
            <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end">
              <label className="hidden items-center gap-2 text-[12px] text-ink-3 lg:flex">
                Largura do original
                <input
                  type="range"
                  min={28}
                  max={70}
                  value={splitPct}
                  onChange={(e) => setSplitPct(Number(e.target.value))}
                  className="w-36"
                  aria-valuetext={`${splitPct}%`}
                />
                <span className="w-8 tabular-nums text-ink-4">{splitPct}%</span>
              </label>
              <label className="flex items-center gap-2 text-[12px] text-ink-3">
                Altura dos quadros
                <input
                  type="range"
                  min={MIN_COMPARE_PANEL_HEIGHT}
                  max={MAX_COMPARE_PANEL_HEIGHT}
                  step={20}
                  value={panelHeight}
                  onChange={(e) => setPanelHeight(Number(e.target.value))}
                  className="w-36"
                  aria-valuetext={`${panelHeight}px`}
                />
                <span className="w-12 tabular-nums text-ink-4">{panelHeight}px</span>
              </label>
            </div>
          </div>
        )}

        <div
          className={cn(
            compareMode && originalFile && 'flex flex-col gap-3 lg:flex-row lg:items-stretch',
          )}
          style={
            compareMode && originalFile
              ? { ['--compare-split' as string]: `${splitPct}%` }
              : undefined
          }
        >
          {compareMode && originalFile && (
            <div
              className={cn(
                'min-h-0 min-w-0 w-full lg:w-[var(--compare-split)] lg:flex-none',
                mobilePane !== 'original' && 'max-lg:hidden',
              )}
              style={{ height: panelHeight, maxHeight: panelHeight }}
            >
              <OriginalFilePane
                actId={act.id}
                attachment={originalFile}
                heightPx={panelHeight}
                className="h-full"
              />
            </div>
          )}
          <div
            className={cn(
              'min-w-0',
              compareMode && originalFile && 'flex min-h-0 w-full flex-1 flex-col overflow-hidden',
              compareMode && originalFile && mobilePane !== 'texto' && 'max-lg:hidden',
            )}
            style={
              compareMode && originalFile
                ? { height: panelHeight, maxHeight: panelHeight }
                : undefined
            }
          >
        <section
          className={cn(
            'rounded-[14px] border border-line bg-surface p-5 shadow-sm',
            compareMode && originalFile && 'flex h-full min-h-0 flex-col overflow-hidden',
          )}
        >
          <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-2">
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
            <p className="mb-3 shrink-0 text-[12px] text-ink-3">{hierarchy.warnings[0]}</p>
          )}

          <div
            className={cn(
              'space-y-1.5',
              compareMode && originalFile && 'min-h-0 flex-1 overflow-y-auto pr-1',
            )}
          >
            {units.map((unit, index) => {
              if (isCollapsedAway(unit, units, collapsed)) return null;
              const childCount = units.filter((u) => u.parentUnitId === unit.id).length;
              const canToggle = hasChildren(unit.id, units);
              const isOpen = !collapsed.has(unit.id);
              const indent = unitIndentPx(unit, units);

              return (
                <div
                  key={unit.id}
                  onDragOver={(e) => {
                    if (!editable || dragIndex === null) return;
                    e.preventDefault();
                  }}
                  onDrop={() => onDrop(index)}
                  onDragEnd={onDragEnd}
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
                  {editable ? (
                    <span
                      draggable
                      onDragStart={(e) => onDragStart(index, e)}
                      onDragEnd={onDragEnd}
                      className="mt-1 inline-flex shrink-0 cursor-grab touch-none text-ink-4 active:cursor-grabbing"
                      aria-label="Arrastar para reordenar"
                      title="Arrastar para reordenar"
                    >
                      <GripVertical className="h-4 w-4" />
                    </span>
                  ) : (
                    <GripVertical className="mt-1 h-4 w-4 shrink-0 text-ink-4 opacity-40" />
                  )}
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
              className="mt-4 shrink-0"
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
    </div>
  );
}
