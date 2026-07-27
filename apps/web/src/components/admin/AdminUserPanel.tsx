'use client';

import { useMemo, useState } from 'react';
import { Building2, ChevronDown, KeyRound, LogOut, UserCircle2 } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';
import { useAdminDirty } from '@/components/admin/AdminDirtyContext';
import { ChangePasswordDialog } from '@/components/admin/ChangePasswordDialog';
import { setAuthCookies, switchContext } from '@/lib/auth';
import { routeRequiredPermission, hasPermission, type AdminPermission } from '@/lib/permissions';
import { cn, formatOriginOrgLabel } from '@/lib/format';

export function AdminUserPanel() {
  const pathname = usePathname();
  const { user, loading, logout, applySession } = useAdminAuth();
  const { isDirty, dirtyMessage } = useAdminDirty();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initial = user?.nome?.charAt(0)?.toUpperCase() ?? '?';

  const roleOptions = useMemo(() => {
    if (!user?.linkedRoles?.length) {
      return user?.role ? [{ id: user.activeRoleId, nome: user.role, isPrimary: true }] : [];
    }
    return user.linkedRoles;
  }, [user]);

  const orgOptions = useMemo(() => {
    const linked = user?.linkedOrgs ?? [];
    const opts = linked.map((o) => ({
      id: o.id,
      label: formatOriginOrgLabel(o),
      isPrimary: o.isPrimary,
    }));
    if (user?.canAccessAllOrgs && linked.length > 0) {
      opts.unshift({ id: 'all', label: 'Todos os órgãos', isPrimary: false });
    }
    return opts;
  }, [user]);

  const activeRoleLabel = user?.role?.replace(/_/g, ' ') ?? '—';
  const activeOrgLabel = user?.activeOrgaoAll
    ? 'Todos os órgãos'
    : user?.activeOrgaoNome ?? (user?.linkedOrgs?.length ? 'Sem órgão' : '—');

  const canSwitch = roleOptions.length > 1 || orgOptions.length > 1;

  const performSwitch = async (data: { roleId?: string; orgaoId?: string | 'all' }) => {
    if (!user) return;
    setError(null);

    if (isDirty) {
      const proceed = window.confirm(
        `${dirtyMessage ?? 'Há alterações não salvas.'}\n\nDeseja alternar o contexto mesmo assim? Alterações podem ser perdidas.`,
      );
      if (!proceed) return;
    }

    setSwitching(true);
    try {
      const res = await switchContext(data);
      const required = routeRequiredPermission(pathname ?? '');
      if (required && !hasPermission(res.user.permissions, required as AdminPermission)) {
        const proceed = window.confirm(
          `O perfil selecionado não possui permissão para a operação atual (${required}).\n\nDeseja continuar? Você pode perder acesso a esta tela.`,
        );
        if (!proceed) return;
      }
      setAuthCookies(res.accessToken, res.refreshToken);
      applySession(res.accessToken, res.refreshToken, res.user);
      setContextOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alternar contexto');
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="border-t border-line p-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink">
            {loading ? 'Carregando...' : (user?.nome ?? '—')}
          </p>
          <p className="truncate text-[11px] text-ink-3">{user?.email ?? ''}</p>
        </div>
      </div>

      {user && (
        <div className="mb-2 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <UserCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">
              <span className="font-medium text-ink-2">{activeRoleLabel}</span>
              {roleOptions.length > 1 && (
                <span className="text-ink-4"> · {roleOptions.length} perfis</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <Building2 className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">
              <span className="font-medium text-ink-2">{activeOrgLabel}</span>
              {user.linkedOrgs.length > 1 && !user.activeOrgaoAll && (
                <span className="text-ink-4"> · {user.linkedOrgs.length} órgãos</span>
              )}
            </span>
          </div>
        </div>
      )}

      {canSwitch && (
        <div className="mb-2">
          <button
            type="button"
            onClick={() => setContextOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-[8px] border border-line bg-canvas px-2.5 py-1.5 text-left text-[11.5px] text-ink-2 hover:border-brand/40 hover:text-brand"
          >
            <span>Alternar perfil / órgão</span>
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', contextOpen && 'rotate-180')} />
          </button>

          {contextOpen && (
            <div className="mt-2 space-y-2 rounded-[10px] border border-line bg-surface p-2.5">
              {roleOptions.length > 1 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-4">
                    Perfil ativo
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {roleOptions.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        disabled={switching || r.id === user?.activeRoleId}
                        onClick={() => void performSwitch({ roleId: r.id })}
                        className={cn(
                          'rounded-[6px] px-2 py-1 text-[11px] font-medium',
                          r.id === user?.activeRoleId
                            ? 'bg-brand-soft text-brand'
                            : 'bg-canvas text-ink-2 hover:bg-surface-2',
                        )}
                      >
                        {r.nome.replace(/_/g, ' ')}
                        {r.isPrimary && r.id !== user?.activeRoleId && (
                          <span className="ml-1 text-ink-4">(principal)</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {orgOptions.length > 1 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-4">
                    Órgão ativo
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {orgOptions.map((o) => {
                      const isActive =
                        o.id === 'all'
                          ? user?.activeOrgaoAll
                          : o.id === user?.activeOrgaoId && !user?.activeOrgaoAll;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          disabled={switching || isActive}
                          onClick={() =>
                            void performSwitch({
                              orgaoId: o.id === 'all' ? 'all' : o.id,
                            })
                          }
                          className={cn(
                            'rounded-[6px] px-2 py-1 text-[11px] font-medium',
                            isActive
                              ? 'bg-brand-soft text-brand'
                              : 'bg-canvas text-ink-2 hover:bg-surface-2',
                          )}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {error && <p className="text-[11px] text-danger">{error}</p>}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setChangePasswordOpen(true)}
        className="mb-2 flex items-center gap-2 text-[12.5px] text-ink-3 hover:text-brand"
      >
        <KeyRound className="h-3.5 w-3.5" />
        Alterar minha senha
      </button>
      <button
        type="button"
        onClick={logout}
        className="flex items-center gap-2 text-[12.5px] text-ink-3 hover:text-danger"
      >
        <LogOut className="h-3.5 w-3.5" />
        Sair
      </button>

      <ChangePasswordDialog
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />
    </div>
  );
}
