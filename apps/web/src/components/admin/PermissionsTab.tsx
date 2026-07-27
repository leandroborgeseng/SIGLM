'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Lock, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import {
  getUserPermissions,
  setRolePermissions,
  setUserExtraPermissions,
  type AdminRole,
  type AdminUser,
  type UserPermissionsDetail,
} from '@/lib/admin-api';
import { cn } from '@/lib/format';
import {
  PERMISSION_CATALOG,
  PERMISSION_CATALOG_BY_KEY,
  PERMISSION_GROUPS,
  permissionLabel,
  type PermissionGroupId,
} from '@/lib/permission-catalog';

type PermissionsMode = 'role' | 'user';

function PermissionAccordion({
  groups,
  renderPermission,
  defaultOpen = true,
}: {
  groups: { id: PermissionGroupId; label: string; permissions: { id: string; chave: string }[] }[];
  renderPermission: (perm: { id: string; chave: string }) => React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [openGroups, setOpenGroups] = useState<Set<PermissionGroupId>>(
    () => new Set(defaultOpen ? groups.map((g) => g.id) : []),
  );

  const toggleGroup = (id: PermissionGroupId) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const isOpen = openGroups.has(group.id);
        return (
          <section
            key={group.id}
            className="overflow-hidden rounded-[14px] border border-line bg-surface shadow-sm"
          >
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
              aria-expanded={isOpen}
            >
              <span className="text-[14px] font-semibold text-ink">{group.label}</span>
              <span className="flex items-center gap-2 text-[12px] text-ink-3">
                {group.permissions.length} permissão(ões)
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')}
                />
              </span>
            </button>
            {isOpen && (
              <ul className="divide-y divide-line border-t border-line">
                {group.permissions.map((perm) => (
                  <li key={perm.id}>{renderPermission(perm)}</li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function PermissionMeta({ chave }: { chave: string }) {
  const def = PERMISSION_CATALOG_BY_KEY[chave as keyof typeof PERMISSION_CATALOG_BY_KEY];
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[14px] font-medium text-ink">{def?.nome ?? chave}</p>
      <p className="font-mono text-[11px] text-ink-4">{chave}</p>
      {def?.descricao && (
        <p className="mt-1 text-[12.5px] leading-snug text-ink-3">{def.descricao}</p>
      )}
    </div>
  );
}

function EffectiveSummary({
  effective,
  title,
}: {
  effective: { chave: string; source: 'role' | 'extra' }[];
  title: string;
}) {
  if (!effective.length) {
    return (
      <div className="rounded-[12px] border border-line bg-surface-2 px-4 py-3">
        <p className="text-[13px] font-semibold text-ink">{title}</p>
        <p className="mt-1 text-[12.5px] text-ink-3">Nenhuma permissão efetiva.</p>
      </div>
    );
  }

  return (
    <div className="rounded-[12px] border border-line bg-surface-2 px-4 py-3">
      <p className="text-[13px] font-semibold text-ink">{title}</p>
      <p className="mt-1 text-[12px] text-ink-3">
        {effective.length} permissão(ões) efetiva(s) — perfil + adicionais
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {effective.map((p) => (
          <li key={p.chave}>
            <Badge variant={p.source === 'extra' ? 'info' : 'neutral'}>
              {permissionLabel(p.chave)}
              {p.source === 'extra' && (
                <span className="ml-1 text-[10px] opacity-80">+extra</span>
              )}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RolePermissionsPanel({
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const r = roles.find((x) => x.id === selectedRoleId);
    setSelected(new Set(r?.permissions.map((p) => p.permission.id) ?? []));
  }, [roles, selectedRoleId]);

  const grouped = useMemo(() => {
    const byKey = Object.fromEntries(permissions.map((p) => [p.chave, p]));
    return PERMISSION_GROUPS.map((group) => ({
      ...group,
      permissions: PERMISSION_CATALOG.filter((def) => def.grupo === group.id)
        .map((def) => byKey[def.chave])
        .filter(Boolean) as { id: string; chave: string }[],
    })).filter((g) => g.permissions.length > 0);
  }, [permissions]);

  const effectivePreview = useMemo(
    () =>
      permissions
        .filter((p) => selected.has(p.id))
        .map((p) => ({ chave: p.chave, source: 'role' as const })),
    [permissions, selected],
  );

  if (!role) return <p className="text-ink-3">Nenhum perfil cadastrado.</p>;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await setRolePermissions(role.id, [...selected]);
      toast('Permissões do perfil salvas', 'ok');
      await onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro', 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-[12px] font-medium text-ink-2">Perfil</label>
          <Select value={selectedRoleId} onChange={(e) => setSelectedRoleId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome} ({r._count?.users ?? 0} usuários)
              </option>
            ))}
          </Select>
        </div>
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar permissões do perfil'}
        </Button>
      </div>

      {role.descricao && <p className="text-[13px] text-ink-3">{role.descricao}</p>}

      <PermissionAccordion
        groups={grouped}
        renderPermission={(perm) => (
          <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-canvas/50">
            <input
              type="checkbox"
              checked={selected.has(perm.id)}
              onChange={() => toggle(perm.id)}
              className="mt-1 h-4 w-4 shrink-0 rounded border-line"
            />
            <PermissionMeta chave={perm.chave} />
          </label>
        )}
      />

      <EffectiveSummary effective={effectivePreview} title="Permissões efetivas do perfil" />
    </div>
  );
}

function UserExtraPermissionsPanel({
  users,
  permissions,
  onChanged,
}: {
  users: AdminUser[];
  permissions: { id: string; chave: string }[];
  onChanged: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id ?? '');
  const [detail, setDetail] = useState<UserPermissionsDetail | null>(null);
  const [extraSelected, setExtraSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadUser = useCallback(async (userId: string) => {
    if (!userId) {
      setDetail(null);
      setExtraSelected(new Set());
      return;
    }
    setLoading(true);
    try {
      const data = await getUserPermissions(userId);
      setDetail(data);
      setExtraSelected(new Set(data.extraPermissions.map((p) => p.id)));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro ao carregar permissões', 'danger');
      setDetail(null);
      setExtraSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadUser(selectedUserId);
  }, [selectedUserId, loadUser]);

  const rolePermissionIds = useMemo(
    () => new Set(detail?.role.permissions.map((p) => p.id) ?? []),
    [detail],
  );

  const grouped = useMemo(() => {
    const byKey = Object.fromEntries(permissions.map((p) => [p.chave, p]));
    return PERMISSION_GROUPS.map((group) => ({
      ...group,
      permissions: PERMISSION_CATALOG.filter((def) => def.grupo === group.id)
        .map((def) => byKey[def.chave])
        .filter(Boolean) as { id: string; chave: string }[],
    })).filter((g) => g.permissions.length > 0);
  }, [permissions]);

  const effectivePreview = useMemo(() => {
    if (!detail) return [];
    const extras = permissions.filter((p) => extraSelected.has(p.id) && !rolePermissionIds.has(p.id));
    const effective = [
      ...detail.role.permissions.map((p) => ({ chave: p.chave, source: 'role' as const })),
      ...extras.map((p) => ({ chave: p.chave, source: 'extra' as const })),
    ];
    return effective.filter(
      (p, i, arr) => arr.findIndex((x) => x.chave === p.chave) === i,
    );
  }, [detail, permissions, extraSelected, rolePermissionIds]);

  const toggleExtra = (perm: { id: string; chave: string }) => {
    if (rolePermissionIds.has(perm.id)) return;
    setExtraSelected((prev) => {
      const next = new Set(prev);
      if (next.has(perm.id)) next.delete(perm.id);
      else next.add(perm.id);
      return next;
    });
  };

  const save = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      const onlyExtras = [...extraSelected].filter((id) => !rolePermissionIds.has(id));
      await setUserExtraPermissions(selectedUserId, onlyExtras);
      toast('Permissões adicionais salvas', 'ok');
      await loadUser(selectedUserId);
      await onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erro', 'danger');
    } finally {
      setSaving(false);
    }
  };

  if (!users.length) return <p className="text-ink-3">Nenhum usuário cadastrado.</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-[12px] font-medium text-ink-2">Usuário</label>
          <Select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome} — {u.role.nome}
              </option>
            ))}
          </Select>
        </div>
        <Button
          size="sm"
          onClick={() => void save()}
          disabled={saving || loading || !selectedUserId}
        >
          {saving ? 'Salvando…' : 'Salvar permissões adicionais'}
        </Button>
      </div>

      {detail && (
        <p className="text-[13px] text-ink-3">
          Perfil base: <strong className="font-medium text-ink">{detail.role.nome}</strong>.
          Marque apenas permissões <em>extras</em> além do perfil — as herdadas do perfil não
          podem ser removidas aqui.
        </p>
      )}

      {loading ? (
        <p className="text-[14px] text-ink-3">Carregando permissões do usuário…</p>
      ) : (
        <PermissionAccordion
          groups={grouped}
          defaultOpen={false}
          renderPermission={(perm) => {
            const fromRole = rolePermissionIds.has(perm.id);
            const isExtra = extraSelected.has(perm.id) && !fromRole;

            return (
              <div
                className={cn(
                  'flex items-start gap-3 px-4 py-3',
                  fromRole ? 'bg-brand/5' : 'hover:bg-canvas/50',
                )}
              >
                {fromRole ? (
                  <span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand"
                    title="Herdada do perfil"
                  >
                    <Lock className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleExtra(perm)}
                    className={cn(
                      'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors',
                      isExtra
                        ? 'border-brand bg-brand text-white'
                        : 'border-line bg-surface text-ink-3 hover:border-brand/40 hover:text-brand',
                    )}
                    title={isExtra ? 'Remover permissão adicional' : 'Conceder permissão adicional'}
                  >
                    {isExtra ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  </button>
                )}

                <PermissionMeta chave={perm.chave} />

                <div className="shrink-0 pt-0.5">
                  {fromRole ? (
                    <Badge variant="neutral">Do perfil</Badge>
                  ) : isExtra ? (
                    <Badge variant="info">Adicional</Badge>
                  ) : (
                    <Badge variant="neutral">Disponível</Badge>
                  )}
                </div>
              </div>
            );
          }}
        />
      )}

      {detail && (
        <EffectiveSummary
          effective={effectivePreview}
          title={`Permissões efetivas de ${detail.userNome}`}
        />
      )}
    </div>
  );
}

export function PermissionsTab({
  roles,
  users,
  permissions,
  onChanged,
}: {
  roles: AdminRole[];
  users: AdminUser[];
  permissions: { id: string; chave: string }[];
  onChanged: () => Promise<void>;
}) {
  const [mode, setMode] = useState<PermissionsMode>('role');

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-[18px] font-semibold text-ink">Permissões</h2>
        <p className="mt-1 text-[13.5px] text-ink-3">
          Configure o que cada perfil pode fazer e conceda permissões extras individuais. As
          permissões efetivas são a soma do perfil e dos extras — não há negação explícita.
        </p>
      </div>

      <div className="flex gap-1 rounded-[12px] border border-line bg-surface-2 p-1">
        <button
          type="button"
          onClick={() => setMode('role')}
          className={cn(
            'flex-1 rounded-[10px] px-3 py-2.5 text-[13px] font-semibold transition-colors',
            mode === 'role' ? 'bg-surface text-brand shadow-sm' : 'text-ink-3 hover:text-ink',
          )}
        >
          Permissões por perfil
        </button>
        <button
          type="button"
          onClick={() => setMode('user')}
          className={cn(
            'flex-1 rounded-[10px] px-3 py-2.5 text-[13px] font-semibold transition-colors',
            mode === 'user' ? 'bg-surface text-brand shadow-sm' : 'text-ink-3 hover:text-ink',
          )}
        >
          Permissões adicionais por usuário
        </button>
      </div>

      {mode === 'role' ? (
        <RolePermissionsPanel roles={roles} permissions={permissions} onChanged={onChanged} />
      ) : (
        <UserExtraPermissionsPanel users={users} permissions={permissions} onChanged={onChanged} />
      )}
    </div>
  );
}
