'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminTopbar } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import {
  createOrgan,
  createUser,
  listOrgans,
  listPermissions,
  listRoles,
  listUsers,
  setRolePermissions,
  updateOrgan,
  updateUser,
  type AdminRole,
  type AdminUser,
  type OriginOrg,
} from '@/lib/admin-api';
import { cn } from '@/lib/format';

type Tab = 'usuarios' | 'orgaos' | 'permissoes';

const TABS: { id: Tab; label: string }[] = [
  { id: 'usuarios', label: 'Usuários' },
  { id: 'orgaos', label: 'Órgãos de Origem' },
  { id: 'permissoes', label: 'Permissões' },
];

export function AdministrationPanel() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('usuarios');
  const [loading, setLoading] = useState(true);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [organs, setOrgans] = useState<OriginOrg[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [permissions, setPermissions] = useState<{ id: string; chave: string }[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [u, o, r, p] = await Promise.all([
        listUsers(),
        listOrgans(false),
        listRoles(),
        listPermissions(),
      ]);
      setUsers(u);
      setOrgans(o);
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
      <AdminTopbar title="Administração" subtitle="Cadastros auxiliares do sistema" />

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
        ) : (
          <PermissionsTab
            roles={roles}
            permissions={permissions}
            onChanged={reload}
          />
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
            placeholder="Senha (mín. 6)"
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
              <p className="text-[12.5px] text-ink-3">{u.email}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="neutral">{u.role.nome}</Badge>
              <Badge variant={u.ativo ? 'ok' : 'danger'}>{u.ativo ? 'Ativo' : 'Inativo'}</Badge>
              <Select
                className="w-auto min-w-[140px]"
                value={u.role.id}
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
  const [editing, setEditing] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createOrgan(nome);
      toast('Órgão cadastrado', 'ok');
      setNome('');
      await onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro', 'danger');
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <form onSubmit={submit} className="flex flex-wrap gap-2 rounded-[14px] border border-line bg-surface p-4 shadow-sm">
        <Input
          className="min-w-[220px] flex-1"
          placeholder="Nome do órgão"
          required
          value={nome}
          onChange={(e) => setNome(e.target.value)}
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
                    await updateOrgan(o.id, { nome: editNome });
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
                  <p className="text-[14px] font-semibold text-ink">{o.nome}</p>
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
        Órgãos vinculados a atos não são excluídos — apenas inativados, preservando o histórico.
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
