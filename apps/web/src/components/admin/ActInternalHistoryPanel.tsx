'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { AdminTopbar } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import {
  compareActHistory,
  getActHistoryEntry,
  listActInternalHistory,
  type ActHistoryEntry,
} from '@/lib/admin-api';

const ACAO_LABELS: Record<string, string> = {
  criar_ato: 'Criação',
  importacao: 'Importação',
  criar_versao: 'Criar versão',
  editar_metadados: 'Metadados',
  salvar_unidades: 'Salvar estrutura',
  incluir_elemento: 'Incluir elemento',
  efeitos_legislativos: 'Efeitos legislativos',
  enviar_revisao: 'Enviar revisão',
  publicacao: 'Publicação',
  restaurar_texto: 'Restaurar texto',
  anexar_arquivo_original: 'Anexar arquivo original',
  substituir_arquivo_original: 'Substituir arquivo original',
  criar_suplemento: 'Criar anexo/informação',
  editar_suplemento: 'Editar anexo/informação',
  reordenar_suplementos: 'Reordenar anexos',
  remover_suplemento: 'Remover anexo/informação',
};

type SnapshotUnit = {
  id: string;
  tipoUnidade: string;
  identificacao: string | null;
  texto: string;
  ordem: number;
};

type DiffResult = {
  left: { id: string; acao: string; createdAt: string; resumo: string | null };
  right: { id: string; acao: string; createdAt: string; resumo: string | null };
  diff: {
    metaChanges: { campo: string; de: unknown; para: unknown }[];
    units: {
      added: SnapshotUnit[];
      removed: SnapshotUnit[];
      changed: {
        id: string;
        identificacao: string | null;
        fields: string[];
        de: SnapshotUnit;
        para: SnapshotUnit;
      }[];
      orderChanged: boolean;
    };
  };
};

export function ActInternalHistoryPanel({
  actId,
  actLabel,
}: {
  actId: string;
  actLabel: string;
}) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<ActHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ActHistoryEntry | null>(null);
  const [leftId, setLeftId] = useState('');
  const [rightId, setRightId] = useState('');
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    listActInternalHistory(actId)
      .then(setEntries)
      .catch((e) => toast(e instanceof Error ? e.message : 'Erro ao carregar histórico', 'danger'))
      .finally(() => setLoading(false));
  }, [actId, toast]);

  const openEntry = async (id: string) => {
    try {
      const entry = await getActHistoryEntry(actId, id);
      setSelected(entry);
      setDiff(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao abrir registro', 'danger');
    }
  };

  const runCompare = async () => {
    if (!leftId || !rightId || leftId === rightId) {
      toast('Selecione dois registros diferentes', 'warn');
      return;
    }
    setComparing(true);
    try {
      const result = await compareActHistory(actId, leftId, rightId);
      setDiff(result as DiffResult);
      setSelected(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro na comparação', 'danger');
    } finally {
      setComparing(false);
    }
  };

  const snapshot = selected?.snapshot as
    | { metadata?: Record<string, unknown>; units?: SnapshotUnit[] }
    | null
    | undefined;

  return (
    <>
      <AdminTopbar
        title="Histórico interno"
        actions={
          <Link href={`/admin/atos/${actId}/editor`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar ao editor
            </Button>
          </Link>
        }
      />

      <div className="space-y-6 p-6">
        <div>
          <p className="text-[13px] text-ink-3">Ato</p>
          <h2 className="text-section">{actLabel}</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-ink-3">
            Linha do tempo administrativa (salvamentos, versões e publicações). Não aparece na
            consulta pública — o histórico do cidadão continua limitado aos efeitos legislativos.
          </p>
        </div>

        <section className="rounded-[14px] border border-line bg-surface p-4 shadow-sm">
          <h3 className="mb-3 text-[14px] font-semibold">Comparar registros</h3>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-[11px] text-ink-4">Anterior</label>
              <Select value={leftId} onChange={(e) => setLeftId(e.target.value)} className="min-w-[220px]">
                <option value="">Selecione…</option>
                {entries.map((e) => (
                  <option key={e.id} value={e.id}>
                    {new Date(e.createdAt).toLocaleString('pt-BR')} —{' '}
                    {ACAO_LABELS[e.acao] ?? e.acao}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-ink-4">Posterior</label>
              <Select value={rightId} onChange={(e) => setRightId(e.target.value)} className="min-w-[220px]">
                <option value="">Selecione…</option>
                {entries.map((e) => (
                  <option key={e.id} value={e.id}>
                    {new Date(e.createdAt).toLocaleString('pt-BR')} —{' '}
                    {ACAO_LABELS[e.acao] ?? e.acao}
                  </option>
                ))}
              </Select>
            </div>
            <Button size="sm" onClick={runCompare} disabled={comparing}>
              {comparing ? 'Comparando…' : 'Comparar'}
            </Button>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <section className="rounded-[14px] border border-line bg-surface p-4 shadow-sm">
            <h3 className="mb-3 text-[14px] font-semibold">Linha do tempo</h3>
            {loading ? (
              <p className="text-[13px] text-ink-3">Carregando…</p>
            ) : entries.length === 0 ? (
              <p className="text-[13px] text-ink-3">Nenhum registro ainda.</p>
            ) : (
              <ul className="max-h-[70vh] space-y-2 overflow-auto">
                {entries.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => openEntry(e.id)}
                      className={`w-full rounded-[10px] border px-3 py-2 text-left transition ${
                        selected?.id === e.id
                          ? 'border-brand bg-brand/5'
                          : 'border-line-2 hover:border-brand/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="neutral" className="text-[10px]">
                          {ACAO_LABELS[e.acao] ?? e.acao}
                        </Badge>
                        {e.revisionNumber != null && (
                          <span className="font-mono text-[11px] text-ink-4">
                            v{e.revisionNumber}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[12px] text-ink-2">{e.resumo ?? '—'}</p>
                      <p className="mt-1 text-[11px] text-ink-4">
                        {new Date(e.createdAt).toLocaleString('pt-BR')}
                        {e.user ? ` · ${e.user.nome}` : ''}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-[14px] border border-line bg-surface p-5 shadow-sm">
            {diff ? (
              <div className="space-y-4">
                <h3 className="text-[14px] font-semibold">Diferenças</h3>
                <p className="text-[12px] text-ink-3">
                  {new Date(diff.left.createdAt).toLocaleString('pt-BR')} →{' '}
                  {new Date(diff.right.createdAt).toLocaleString('pt-BR')}
                </p>
                {diff.diff.metaChanges.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-[13px] font-semibold">Metadados</h4>
                    <ul className="space-y-1 text-[12.5px]">
                      {diff.diff.metaChanges.map((c) => (
                        <li key={c.campo} className="rounded border border-line-2 px-2 py-1">
                          <strong>{c.campo}</strong>: {JSON.stringify(c.de)} →{' '}
                          {JSON.stringify(c.para)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {diff.diff.units.orderChanged && (
                  <p className="text-[13px] text-warn">Ordem dos elementos alterada.</p>
                )}
                {diff.diff.units.added.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-[13px] font-semibold text-ok">Incluídos</h4>
                    <ul className="space-y-1 text-[12.5px]">
                      {diff.diff.units.added.map((u) => (
                        <li key={u.id}>
                          {u.identificacao ?? u.tipoUnidade}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {diff.diff.units.removed.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-[13px] font-semibold text-danger">Removidos</h4>
                    <ul className="space-y-1 text-[12.5px]">
                      {diff.diff.units.removed.map((u) => (
                        <li key={u.id}>
                          {u.identificacao ?? u.tipoUnidade}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {diff.diff.units.changed.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-[13px] font-semibold">Alterados</h4>
                    <ul className="space-y-2 text-[12.5px]">
                      {diff.diff.units.changed.map((u) => (
                        <li key={u.id} className="rounded border border-line-2 p-2">
                          <p className="font-semibold">
                            {u.identificacao ?? u.id} ({u.fields.join(', ')})
                          </p>
                          {u.fields.includes('texto') && (
                            <div className="mt-1 grid gap-2 md:grid-cols-2">
                              <pre className="whitespace-pre-wrap rounded bg-surface-2 p-2 text-[11px]">
                                {u.de.texto}
                              </pre>
                              <pre className="whitespace-pre-wrap rounded bg-brand/5 p-2 text-[11px]">
                                {u.para.texto}
                              </pre>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!diff.diff.metaChanges.length &&
                  !diff.diff.units.added.length &&
                  !diff.diff.units.removed.length &&
                  !diff.diff.units.changed.length &&
                  !diff.diff.units.orderChanged && (
                    <p className="text-[13px] text-ink-3">Nenhuma diferença detectada.</p>
                  )}
              </div>
            ) : selected && snapshot ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-[14px] font-semibold">
                    {ACAO_LABELS[selected.acao] ?? selected.acao}
                  </h3>
                  <p className="text-[12px] text-ink-3">
                    {new Date(selected.createdAt).toLocaleString('pt-BR')}
                    {selected.user ? ` · ${selected.user.nome}` : ''}
                  </p>
                  <p className="mt-1 text-[13px]">{selected.resumo}</p>
                </div>
                {snapshot.metadata && (
                  <div>
                    <h4 className="mb-2 text-[13px] font-semibold">Metadados na fotografia</h4>
                    <dl className="grid gap-1 text-[12.5px] sm:grid-cols-2">
                      {Object.entries(snapshot.metadata).map(([k, v]) => (
                        <div key={k} className="rounded border border-line-2 px-2 py-1">
                          <dt className="text-[10px] uppercase text-ink-4">{k}</dt>
                          <dd>{typeof v === 'string' ? v : JSON.stringify(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
                <div>
                  <h4 className="mb-2 text-[13px] font-semibold">
                    Texto estruturado ({snapshot.units?.length ?? 0} elementos)
                  </h4>
                  <ul className="max-h-[55vh] space-y-2 overflow-auto">
                    {(snapshot.units ?? []).map((u) => (
                      <li key={u.id} className="rounded border border-line-2 p-2 text-[12.5px]">
                        <p className="font-mono text-[11px] font-semibold text-brand">
                          {u.identificacao ?? u.tipoUnidade}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-ink-2">{u.texto}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-ink-3">
                Selecione um registro na linha do tempo ou compare duas fotografias.
              </p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
