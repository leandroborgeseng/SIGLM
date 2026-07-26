'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import {
  createActSupplement,
  fetchActAttachmentFileUrl,
  listActAttachments,
  removeActSupplement,
  reorderActSupplements,
  updateActSupplement,
  uploadActOriginal,
  uploadActPublication,
  type ActAttachmentsBundle,
} from '@/lib/admin-api';
import { getApiBaseUrl } from '@/lib/api-url';
import type { ActAttachment } from '@/lib/types';

async function openAdminAttachment(actId: string, attachmentId: string) {
  const url = await fetchActAttachmentFileUrl(actId, attachmentId);
  window.open(url, '_blank', 'noopener,noreferrer');
}

function resolveDirectLink(item: ActAttachment): string {
  const API_URL = getApiBaseUrl();
  if (item.href) {
    if (/^https?:\/\//i.test(item.href) || item.href.startsWith('/')) return item.href;
    return item.href;
  }
  if (item.directLink) {
    return item.directLink.startsWith('http')
      ? item.directLink
      : `${API_URL}${item.directLink}`;
  }
  if (item.downloadUrl) {
    return item.downloadUrl.startsWith('http')
      ? item.downloadUrl
      : `${API_URL}${item.downloadUrl}`;
  }
  if (item.url) {
    return `${API_URL}/public/attachments/${item.id}/file`;
  }
  return '';
}

function SupplementSection({
  actId,
  secao,
  title,
  items,
  editable,
  onChanged,
}: {
  actId: string;
  secao: 'topo' | 'final';
  title: string;
  items: ActAttachment[];
  editable: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [modo, setModo] = useState<'arquivo' | 'hiperlink'>('hiperlink');
  const [href, setHref] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [editTitulo, setEditTitulo] = useState('');
  const [editHref, setEditHref] = useState('');
  const [busy, setBusy] = useState(false);

  const copyLink = async (item: ActAttachment) => {
    const link = resolveDirectLink(item);
    if (!link) {
      toast('Item sem link disponível', 'warn');
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copiado', 'ok');
    } catch {
      toast(link, 'ok');
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= items.length) return;
    const ids = items.map((i) => i.id);
    const tmp = ids[index];
    ids[index] = ids[next];
    ids[next] = tmp;
    try {
      await reorderActSupplements(actId, secao, ids);
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao reordenar', 'danger');
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await createActSupplement(actId, {
        secao,
        titulo: titulo.trim(),
        modo,
        href: modo === 'hiperlink' ? href : undefined,
        file: modo === 'arquivo' ? file : null,
      });
      setTitulo('');
      setHref('');
      setFile(null);
      setAdding(false);
      onChanged();
      toast('Item adicionado', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao adicionar', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (item: ActAttachment) => {
    setBusy(true);
    try {
      await updateActSupplement(actId, item.id, {
        titulo: editTitulo.trim(),
        ...(item.href != null || !item.url
          ? { href: editHref.trim() || undefined }
          : {}),
      });
      setEditingId(null);
      onChanged();
      toast('Item atualizado', 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao editar', 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-[10px] border border-line-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[12.5px] font-semibold text-ink-2">{title}</h3>
        {editable && (
          <Button variant="ghost" size="sm" onClick={() => setAdding((v) => !v)}>
            <Plus className="h-3.5 w-3.5" />
            Novo
          </Button>
        )}
      </div>

      {items.length === 0 && (
        <p className="text-[12px] text-ink-4">Nenhum item nesta seção.</p>
      )}

      <ul className="space-y-2">
        {items.map((item, index) => (
          <li
            key={item.id}
            className="rounded-[8px] border border-line bg-surface-2 px-2.5 py-2 text-[12.5px]"
          >
            {editingId === item.id ? (
              <div className="space-y-2">
                <Input
                  value={editTitulo}
                  onChange={(e) => setEditTitulo(e.target.value)}
                  placeholder="Texto exibido"
                />
                {!item.url && (
                  <Input
                    value={editHref}
                    onChange={(e) => setEditHref(e.target.value)}
                    placeholder="URL / hiperlink"
                  />
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy || !editTitulo.trim()}
                    onClick={() => saveEdit(item)}
                  >
                    Salvar
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="font-medium text-brand">{item.titulo ?? item.nome}</p>
                <p className="mt-0.5 text-[11px] text-ink-4">
                  {item.url ? `Arquivo: ${item.nome}` : `Link: ${item.href}`}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-ink-3 hover:text-brand"
                    onClick={() => copyLink(item)}
                  >
                    <Copy className="h-3 w-3" />
                    Copiar link direto
                  </button>
                  {item.href ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-ink-3 hover:text-brand"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Abrir
                    </a>
                  ) : item.url ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-ink-3 hover:text-brand"
                      onClick={() => {
                        void openAdminAttachment(actId, item.id).catch((e) =>
                          toast(
                            e instanceof Error ? e.message : 'Falha ao abrir arquivo',
                            'danger',
                          ),
                        );
                      }}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Abrir
                    </button>
                  ) : null}
                  {editable && (
                    <>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-ink-3 hover:text-brand"
                        onClick={() => {
                          setEditingId(item.id);
                          setEditTitulo(item.titulo ?? item.nome);
                          setEditHref(item.href ?? '');
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                        Editar
                      </button>
                      <button
                        type="button"
                        className="rounded px-1.5 py-0.5 text-[11px] text-ink-3 hover:text-brand disabled:opacity-30"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        className="rounded px-1.5 py-0.5 text-[11px] text-ink-3 hover:text-brand disabled:opacity-30"
                        disabled={index === items.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-danger"
                        onClick={async () => {
                          if (!window.confirm('Remover este item?')) return;
                          try {
                            await removeActSupplement(actId, item.id);
                            onChanged();
                            toast('Item removido', 'ok');
                          } catch (e) {
                            toast(e instanceof Error ? e.message : 'Erro', 'danger');
                          }
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                        Remover
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {adding && editable && (
        <div className="mt-2 space-y-2 rounded-[8px] border border-dashed border-line p-2.5">
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Texto exibido (obrigatório)"
          />
          <Select
            value={modo}
            onChange={(e) => setModo(e.target.value as 'arquivo' | 'hiperlink')}
          >
            <option value="hiperlink">Hiperlink (URL)</option>
            <option value="arquivo">Arquivo anexado</option>
          </Select>
          {modo === 'hiperlink' ? (
            <Input
              value={href}
              onChange={(e) => setHref(e.target.value)}
              placeholder="https://… ou /legislacao/…"
            />
          ) : (
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-[12px]"
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={busy || !titulo.trim() || (modo === 'arquivo' ? !file : !href.trim())}
              onClick={submit}
            >
              Incluir
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ActMetadataAttachments({
  actId,
  editable,
  onOriginalChange,
  showPublication = true,
  onPublicationChange,
}: {
  actId: string;
  editable: boolean;
  onOriginalChange?: (original: ActAttachment | null) => void;
  /** Exibe a seção de arquivo da publicação (padrão: true; opcional). */
  showPublication?: boolean;
  onPublicationChange?: (publicacao: ActAttachment | null) => void;
}) {
  const { toast } = useToast();
  const [bundle, setBundle] = useState<ActAttachmentsBundle | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingPub, setUploadingPub] = useState(false);

  const reload = useCallback(() => {
    listActAttachments(actId)
      .then((b) => {
        setBundle(b);
        onOriginalChange?.(b.original);
        onPublicationChange?.(b.publicacao ?? null);
      })
      .catch(() => undefined);
  }, [actId, onOriginalChange, onPublicationChange]);

  useEffect(() => {
    reload();
  }, [reload]);

  const onUploadOriginal = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      await uploadActOriginal(actId, file);
      reload();
      toast(
        bundle?.original ? 'Arquivo original substituído' : 'Arquivo original anexado',
        'ok',
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro no upload', 'danger');
    } finally {
      setUploading(false);
    }
  };

  const onUploadPublication = async (file: File | null) => {
    if (!file) return;
    setUploadingPub(true);
    try {
      await uploadActPublication(actId, file);
      reload();
      toast(
        bundle?.publicacao ? 'Arquivo da publicação substituído' : 'Arquivo da publicação anexado',
        'ok',
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro no upload', 'danger');
    } finally {
      setUploadingPub(false);
    }
  };

  const original = bundle?.original;
  const publicacao = bundle?.publicacao ?? null;
  const historico = bundle?.historico ?? [];
  const historicoPublicacao = bundle?.historicoPublicacao ?? [];

  const openFile = (attachmentId: string) => {
    void openAdminAttachment(actId, attachmentId).catch((e) =>
      toast(e instanceof Error ? e.message : 'Falha ao abrir arquivo', 'danger'),
    );
  };

  return (
    <div className="space-y-4 border-t border-line pt-4">
      <div>
        <label className="mb-1 block text-[12px] text-ink-3">Arquivo original do ato</label>
        {original ? (
          <div className="rounded-[10px] border border-line-2 bg-surface-2 px-3 py-2 text-[12.5px]">
            <p className="font-medium text-ink">{original.nome}</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <button
                type="button"
                className="text-brand hover:underline"
                onClick={() => openFile(original.id)}
              >
                Abrir / conferir
              </button>
              {editable && (
                <label className="cursor-pointer text-ink-3 hover:text-brand">
                  <span className="inline-flex items-center gap-1">
                    <Upload className="h-3 w-3" />
                    {uploading ? 'Enviando…' : 'Substituir'}
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,application/pdf"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      void onUploadOriginal(f);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>
            <p className="mt-1 text-[11px] text-ink-4">
              Documento-fonte do cadastro. Substituições ficam preservadas abaixo.
            </p>
          </div>
        ) : (
          <div className="rounded-[10px] border border-dashed border-line px-3 py-3 text-[12.5px] text-ink-3">
            {editable ? (
              <label className="inline-flex cursor-pointer items-center gap-2 text-brand">
                <Upload className="h-4 w-4" />
                {uploading ? 'Enviando…' : 'Enviar PDF / documento original'}
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,application/pdf"
                  disabled={uploading}
                  onChange={(e) => {
                    void onUploadOriginal(e.target.files?.[0] ?? null);
                    e.target.value = '';
                  }}
                />
              </label>
            ) : (
              <span>Nenhum arquivo original vinculado.</span>
            )}
          </div>
        )}
        {historico.length > 0 && (
          <div className="mt-2 rounded-[8px] border border-line px-2.5 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">
              Versões anteriores do arquivo original
            </p>
            <ul className="mt-1.5 space-y-1">
              {historico.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
                  <span>{h.nome}</span>
                  {h.substituidoEm && (
                    <span className="text-ink-4">
                      substituído em {new Date(h.substituidoEm).toLocaleString('pt-BR')}
                    </span>
                  )}
                  <button
                    type="button"
                    className="text-brand hover:underline"
                    onClick={() => openFile(h.id)}
                  >
                    Abrir
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {showPublication && (
        <div>
          <label className="mb-1 block text-[12px] text-ink-3">Arquivo da publicação</label>
          {publicacao ? (
            <div className="rounded-[10px] border border-line-2 bg-surface-2 px-3 py-2 text-[12.5px]">
              <p className="font-medium text-ink">{publicacao.nome}</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="text-brand hover:underline"
                  onClick={() => openFile(publicacao.id)}
                >
                  Abrir / conferir
                </button>
                {editable && (
                  <label className="cursor-pointer text-ink-3 hover:text-brand">
                    <span className="inline-flex items-center gap-1">
                      <Upload className="h-3 w-3" />
                      {uploadingPub ? 'Enviando…' : 'Substituir'}
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,application/pdf"
                      disabled={uploadingPub}
                      onChange={(e) => {
                        void onUploadPublication(e.target.files?.[0] ?? null);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
              <p className="mt-1 text-[11px] text-ink-4">
                Documento oficial da publicação (opcional). Substituições ficam preservadas.
              </p>
            </div>
          ) : (
            <div className="rounded-[10px] border border-dashed border-line px-3 py-3 text-[12.5px] text-ink-3">
              {editable ? (
                <label className="inline-flex cursor-pointer items-center gap-2 text-brand">
                  <Upload className="h-4 w-4" />
                  {uploadingPub ? 'Enviando…' : 'Enviar arquivo da publicação (opcional)'}
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,application/pdf"
                    disabled={uploadingPub}
                    onChange={(e) => {
                      void onUploadPublication(e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />
                </label>
              ) : (
                <span>Nenhum arquivo de publicação vinculado.</span>
              )}
            </div>
          )}
          {historicoPublicacao.length > 0 && (
            <div className="mt-2 rounded-[8px] border border-line px-2.5 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">
                Versões anteriores do arquivo da publicação
              </p>
              <ul className="mt-1.5 space-y-1">
                {historicoPublicacao.map((h) => (
                  <li
                    key={h.id}
                    className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3"
                  >
                    <span>{h.nome}</span>
                    {h.substituidoEm && (
                      <span className="text-ink-4">
                        substituído em {new Date(h.substituidoEm).toLocaleString('pt-BR')}
                      </span>
                    )}
                    <button
                      type="button"
                      className="text-brand hover:underline"
                      onClick={() => openFile(h.id)}
                    >
                      Abrir
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <SupplementSection
        actId={actId}
        secao="topo"
        title="Anexos e informações do topo"
        items={bundle?.topo ?? []}
        editable={editable}
        onChanged={reload}
      />
      <SupplementSection
        actId={actId}
        secao="final"
        title="Anexos e informações do final"
        items={bundle?.final ?? []}
        editable={editable}
        onChanged={reload}
      />
    </div>
  );
}
