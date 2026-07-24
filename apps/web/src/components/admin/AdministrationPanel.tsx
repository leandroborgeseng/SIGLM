'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminTopbar } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import {
  createOrgan,
  createPublicationMedium,
  createSignatory,
  createUser,
  listOrgans,
  listPermissions,
  listPublicationMedia,
  listRoles,
  listSignatories,
  listUsers,
  setRolePermissions,
  updateOrgan,
  updatePublicationMedium,
  updateSignatory,
  updateUser,
  type AdminRole,
  type AdminSignatory,
  type AdminUser,
  type OriginOrg,
  type PublicationMedium,
} from '@/lib/admin-api';
import { cn } from '@/lib/format';

type Tab = 'usuarios' | 'orgaos' | 'meios' | 'signatarios' | 'permissoes';

const TABS: { id: Tab; label: string }[] = [
  { id: 'usuarios', label: 'Usuários' },
  { id: 'orgaos', label: 'Órgãos de Origem' },
  { id: 'meios', label: 'Meios de publicação' },
  { id: 'signatarios', label: 'Signatários' },
  { id: 'permissoes', label: 'Permissões' },
];

export function AdministrationPanel() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('usuarios');
  const [loading, setLoading] = useState(true);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [organs, setOrgans] = useState<OriginOrg[]>([]);
  const [media, setMedia] = useState<PublicationMedium[]>([]);
  const [signatories, setSignatories] = useState<AdminSignatory[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [permissions, setPermissions] = useState<{ id: string; chave: string }[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [u, o, m, s, r, p] = await Promise.all([
        listUsers(),
        listOrgans(false),
        listPublicationMedia(false),
        listSignatories(false),
        listRoles(),
        listPermissions(),
      ]);
      setUsers(u);
      setOrgans(o);
      setMedia(m);
      setSignatories(s);
      setRoles(r);
      setPermissions(p);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao carregar administração', 'danger');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AdminTopbar title="Administração" />

      <div className="border-b border-line bg-surface px-4 sm:px-6">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'shrink-0 border-b-2 px-4 py-3 text-[13.5px] font-semibold transition-colors',
                tab === t.id
                  ? 'border-brand text-brand'
                  : 'border-transparent text-ink-3 hover:text-ink',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {loading ? (
          <p className="text-[14px] text-ink-3">Carregando…</p>
        ) : tab === 'usuarios' ? (
          <UsersTab users={users} roles={roles} onChanged={reload} />
        ) : tab === 'orgaos' ? (
          <OrgansTab organs={organs} onChanged={reload} />
        ) : tab === 'meios' ? (
          <PublicationMediaTab media={media} onChanged={reload} />
        ) : tab === 'signatarios' ? (
          <SignatoriesTab signatories={signatories} organs={organs} onChanged={reload} />
        ) : (
          <PermissionsTab roles={roles} permissions={permissions} onChanged={reload} />
        )}
      </div>
    </div>
  );
}

function UsersTab({
  users,
  roles,
  onChanged,
}: {
  users: AdminUser[];
  roles: AdminRole[];
  onChanged: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({ nome: '', email: '', senha: '', roleId: roles[0]?.id ?? '' });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUser(form);
      toast('Usuário criado', 'ok');
      setForm({ nome: '', email: '', senha: '', roleId: roles[0]?.id ?? '' });
      await onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro', 'danger');
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <form onSubmit={submit} className="rounded-[14px] border border-line bg-surface p-4 shadow-sm">
        <h3 className="text-section mb-3">Novo usuário</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            placeholder="Nome"
            required
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
          />
          <Input
            type="email"
            placeholder="E-mail"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            type="password"
            placeholder="Senha"
            required
            minLength={6}
            value={form.senha}
            onChange={(e) => setForm({ ...form, senha: e.target.value })}
          />
          <Select
            value={form.roleId}
            onChange={(e) => setForm({ ...form, roleId: e.target.value })}
            required
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </Select>
        </div>
        <div className="mt-3 flex justify-end">
          <Button type="submit" size="sm">
            Incluir usuário
          </Button>
        </div>
      </form>

      <ul className="divide-y divide-line rounded-[14px] border border-line bg-surface shadow-sm">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-[14px] font-semibold text-ink">{u.nome}</p>
              <p className="text-[12px] text-ink-3">{u.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={u.role.id}
                className="w-auto text-[12px]"
                onChange={async (e) => {
                  try {
                    await updateUser(u.id, { roleId: e.target.value });
                    toast('Perfil atualizado', 'ok');
                    await onChanged();
                  } catch (err) {
                    toast(err instanceof Error ? err.message : 'Erro', 'danger');
                  }
                }}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
              </Select>
              <Badge variant={u.ativo ? 'ok' : 'danger'}>{u.ativo ? 'Ativo' : 'Inativo'}</Badge>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  try {
                    await updateUser(u.id, { ativo: !u.ativo });
                    toast(u.ativo ? 'Usuário inativado' : 'Usuário reativado', 'ok');
                    await onChanged();
                  } catch (err) {
                    toast(err instanceof Error ? err.message : 'Erro', 'danger');
                  }
                }}
              >
                {u.ativo ? 'Inativar' : 'Reativar'}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OrgansTab({
  organs,
  onChanged,
}: {
  organs: OriginOrg[];
  onChanged: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [nome, setNome] = useState('');
  const [sigla, setSigla] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editSigla, setEditSigla] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createOrgan(nome, sigla || null);
      toast('Órgão cadastrado', 'ok');
      setNome('');
      setSigla('');
      await onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro', 'danger');
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <form
        onSubmit={submit}
        className="flex flex-wrap gap-2 rounded-[14px] border border-line bg-surface p-4 shadow-sm"
      >
        <Input
          className="min-w-[220px] flex-1"
          placeholder="Nome do órgão"
          required
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <Input
          className="w-28"
          placeholder="Sigla"
          value={sigla}
          onChange={(e) => setSigla(e.target.value.toUpperCase())}
        />
        <Button type="submit" size="sm">
          Incluir órgão
        </Button>
      </form>

      <ul className="divide-y divide-line rounded-[14px] border border-line bg-surface shadow-sm">
        {organs.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            {editing === o.id ? (
              <form
                className="flex flex-1 flex-wrap gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await updateOrgan(o.id, { nome: editNome, sigla: editSigla || null });
                    toast('Órgão atualizado', 'ok');
                    setEditing(null);
                    await onChanged();
                  } catch (err) {
                    toast(err instanceof Error ? err.message : 'Erro', 'danger');
                  }
                }}
              >
                <Input
                  className="min-w-[180px] flex-1"
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  required
                />
                <Input
                  className="w-28"
                  value={editSigla}
                  onChange={(e) => setEditSigla(e.target.value.toUpperCase())}
                  placeholder="Sigla"
                />
                <Button type="submit" size="sm">
                  Salvar
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
              </form>
            ) : (
              <>
                <div>
                  <p className="text-[14px] font-semibold text-ink">
                    {o.sigla ? `${o.sigla} — ` : ''}
                    {o.nome}
                  </p>
                  <p className="text-[12px] text-ink-3">
                    {o._count?.acts ?? 0} ato(s) vinculado(s)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={o.ativo ? 'ok' : 'danger'}>
                    {o.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(o.id);
                      setEditNome(o.nome);
                      setEditSigla(o.sigla ?? '');
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await updateOrgan(o.id, { ativo: !o.ativo });
                        toast(o.ativo ? 'Órgão inativado' : 'Órgão reativado', 'ok');
                        await onChanged();
                      } catch (err) {
                        toast(err instanceof Error ? err.message : 'Erro', 'danger');
                      }
                    }}
                  >
                    {o.ativo ? 'Inativar' : 'Reativar'}
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[12.5px] text-ink-3">
        Órgãos vinculados a atos não são excluídos — apenas inativados, preservando o histórico. A
        sigla é usada no prefixo automático do título formal.
      </p>
    </div>
  );
}

function PublicationMediaTab({
  media,
  onChanged,
}: {
  media: PublicationMedium[];
  onChanged: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [nome, setNome] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await createPublicationMedium(nome);
            toast('Meio de publicação cadastrado', 'ok');
            setNome('');
            await onChanged();
          } catch (err) {
            toast(err instanceof Error ? err.message : 'Erro', 'danger');
          }
        }}
        className="flex flex-wrap gap-2 rounded-[14px] border border-line bg-surface p-4 shadow-sm"
      >
        <Input
          className="min-w-[220px] flex-1"
          placeholder="Ex.: Diário Oficial Eletrônico"
          required
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <Button type="submit" size="sm">
          Incluir meio
        </Button>
      </form>

      <ul className="divide-y divide-line rounded-[14px] border border-line bg-surface shadow-sm">
        {media.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            {editing === m.id ? (
              <form
                className="flex flex-1 flex-wrap gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await updatePublicationMedium(m.id, { nome: editNome });
                    toast('Meio atualizado', 'ok');
                    setEditing(null);
                    await onChanged();
                  } catch (err) {
                    toast(err instanceof Error ? err.message : 'Erro', 'danger');
                  }
                }}
              >
                <Input
                  className="min-w-[180px] flex-1"
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  required
                />
                <Button type="submit" size="sm">
                  Salvar
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
              </form>
            ) : (
              <>
                <div>
                  <p className="text-[14px] font-semibold text-ink">{m.nome}</p>
                  <p className="text-[12px] text-ink-3">
                    {m._count?.acts ?? 0} ato(s) vinculado(s)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={m.ativo ? 'ok' : 'danger'}>
                    {m.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(m.id);
                      setEditNome(m.nome);
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await updatePublicationMedium(m.id, { ativo: !m.ativo });
                        toast(m.ativo ? 'Meio inativado' : 'Meio reativado', 'ok');
                        await onChanged();
                      } catch (err) {
                        toast(err instanceof Error ? err.message : 'Erro', 'danger');
                      }
                    }}
                  >
                    {m.ativo ? 'Inativar' : 'Reativar'}
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[12.5px] text-ink-3">
        Meios já vinculados a atos não podem ser excluídos — apenas inativados. Meios inativos
        continuam visíveis nos atos antigos.
      </p>
    </div>
  );
}

function SignatoriesTab({
  signatories,
  organs,
  onChanged,
}: {
  signatories: AdminSignatory[];
  organs: OriginOrg[];
  onChanged: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({ nome: '', cargo: '', orgaoId: '' });
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ nome: '', cargo: '', orgaoId: '' });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await createSignatory({
              nome: form.nome,
              cargo: form.cargo,
              orgaoId: form.orgaoId || null,
            });
            toast('Signatário cadastrado', 'ok');
            setForm({ nome: '', cargo: '', orgaoId: '' });
            await onChanged();
          } catch (err) {
            toast(err instanceof Error ? err.message : 'Erro', 'danger');
          }
        }}
        className="space-y-3 rounded-[14px] border border-line bg-surface p-4 shadow-sm"
      >
        <h3 className="text-section">Novo signatário</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            placeholder="Nome completo"
            required
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
          />
          <Input
            placeholder="Cargo ou função"
            required
            value={form.cargo}
            onChange={(e) => setForm({ ...form, cargo: e.target.value })}
          />
          <Select
            value={form.orgaoId}
            onChange={(e) => setForm({ ...form, orgaoId: e.target.value })}
            className="sm:col-span-2"
          >
            <option value="">Órgão (opcional)</option>
            {organs
              .filter((o) => o.ativo)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.sigla ? `${o.sigla} — ${o.nome}` : o.nome}
                </option>
              ))}
          </Select>
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="sm">
            Incluir signatário
          </Button>
        </div>
      </form>

      <ul className="divide-y divide-line rounded-[14px] border border-line bg-surface shadow-sm">
        {signatories.map((s) => (
          <li key={s.id} className="px-4 py-3">
            {editing === s.id ? (
              <form
                className="space-y-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await updateSignatory(s.id, {
                      nome: edit.nome,
                      cargo: edit.cargo,
                      orgaoId: edit.orgaoId || null,
                    });
                    toast('Signatário atualizado', 'ok');
                    setEditing(null);
                    await onChanged();
                  } catch (err) {
                    toast(err instanceof Error ? err.message : 'Erro', 'danger');
                  }
                }}
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={edit.nome}
                    onChange={(e) => setEdit({ ...edit, nome: e.target.value })}
                    required
                  />
                  <Input
                    value={edit.cargo}
                    onChange={(e) => setEdit({ ...edit, cargo: e.target.value })}
                    required
                  />
                  <Select
                    value={edit.orgaoId}
                    onChange={(e) => setEdit({ ...edit, orgaoId: e.target.value })}
                    className="sm:col-span-2"
                  >
                    <option value="">Órgão (opcional)</option>
                    {organs.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.sigla ? `${o.sigla} — ${o.nome}` : o.nome}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm">
                    Salvar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[14px] font-semibold text-ink">{s.nome}</p>
                  <p className="text-[12.5px] text-ink-2">{s.cargo}</p>
                  {s.orgao && (
                    <p className="text-[12px] text-ink-3">
                      {s.orgao.sigla ? `${s.orgao.sigla} — ` : ''}
                      {s.orgao.nome}
                    </p>
                  )}
                  <p className="text-[11px] text-ink-4">
                    {s._count?.links ?? 0} vínculo(s) em atos
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={s.ativo ? 'ok' : 'danger'}>
                    {s.ativo ? 'Ativo' : 'Inativo'}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(s.id);
                      setEdit({
                        nome: s.nome,
                        cargo: s.cargo,
                        orgaoId: s.orgaoId ?? '',
                      });
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await updateSignatory(s.id, { ativo: !s.ativo });
                        toast(s.ativo ? 'Signatário inativado' : 'Signatário reativado', 'ok');
                        await onChanged();
                      } catch (err) {
                        toast(err instanceof Error ? err.message : 'Erro', 'danger');
                      }
                    }}
                  >
                    {s.ativo ? 'Inativar' : 'Reativar'}
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[12.5px] text-ink-3">
        Alterações no cadastro geral não modificam automaticamente os snapshots já vinculados a
        atos publicados.
      </p>
    </div>
  );
}

function PermissionsTab({
  roles,
  permissions,
  onChanged,
}: {
  roles: AdminRole[];
  permissions: { id: string; chave: string }[];
  onChanged: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id ?? '');
  const role = roles.find((r) => r.id === selectedRoleId) ?? roles[0];
  const [selected, setSelected] = useState<Set<string>>(
    new Set(role?.permissions.map((p) => p.permission.id) ?? []),
  );

  useEffect(() => {
    const r = roles.find((x) => x.id === selectedRoleId);
    setSelected(new Set(r?.permissions.map((p) => p.permission.id) ?? []));
  }, [roles, selectedRoleId]);

  if (!role) return <p className="text-ink-3">Nenhum perfil cadastrado.</p>;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-[12px] text-ink-3">Perfil</label>
          <Select value={selectedRoleId} onChange={(e) => setSelectedRoleId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome} ({r._count?.users ?? 0} usuários)
              </option>
            ))}
          </Select>
        </div>
        <Button
          size="sm"
          onClick={async () => {
            try {
              await setRolePermissions(role.id, [...selected]);
              toast('Permissões salvas', 'ok');
              await onChanged();
            } catch (err) {
              toast(err instanceof Error ? err.message : 'Erro', 'danger');
            }
          }}
        >
          Salvar permissões
        </Button>
      </div>

      <p className="text-[13px] text-ink-3">{role.descricao}</p>

      <ul className="divide-y divide-line rounded-[14px] border border-line bg-surface shadow-sm">
        {permissions.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-3">
            <input
              type="checkbox"
              id={`perm-${p.id}`}
              checked={selected.has(p.id)}
              onChange={() => toggle(p.id)}
              className="h-4 w-4"
            />
            <label htmlFor={`perm-${p.id}`} className="font-mono text-[13px] text-ink">
              {p.chave}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
