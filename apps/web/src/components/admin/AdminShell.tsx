'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Menu, X } from 'lucide-react';
import { FrancaMark } from '@/components/brand/FrancaMark';
import { useAdminAuth } from '@/components/admin/AdminAuthContext';
import { AdminUserPanel } from '@/components/admin/AdminUserPanel';
import { useAdminMenu } from '@/components/admin/AdminMenuContext';
import { filterNavByPermissions } from '@/lib/permissions';
import { cn } from '@/lib/format';

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useAdminAuth();
  const nav = filterNavByPermissions(user?.permissions);

  if (nav.length === 0) {
    return (
      <p className="px-3 text-[13px] text-ink-3">Sem permissões de gestão nesta conta.</p>
    );
  }

  return (
    <>
      <p className="text-section mb-2 px-3">Gestão</p>
      {nav.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              'relative mb-0.5 flex min-h-11 items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium transition-colors',
              active
                ? 'bg-brand-soft text-brand-hover before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r before:bg-brand'
                : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
            )}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </>
  );
}

export function AdminSidebar() {
  const { open, close } = useAdminMenu();
  const pathname = usePathname();
  const { user } = useAdminAuth();
  const nav = filterNavByPermissions(user?.permissions);

  return (
    <>
      <aside className="hidden w-[264px] shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-[60px] items-center gap-2.5 border-b border-line px-4">
          <FrancaMark size={36} />
          <div className="leading-tight">
            <div className="text-[16px] font-bold tracking-tight text-ink">Legislação</div>
            <div className="text-[10.5px] font-medium text-ink-3">Painel administrativo</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-3" aria-label="Menu administrativo">
          <NavLinks />
        </nav>
        <AdminUserPanel />
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/40"
            aria-label="Fechar menu"
            onClick={close}
          />
          <aside className="relative flex h-full w-[min(100%,280px)] flex-col bg-surface shadow-lg">
            <div className="flex h-[60px] items-center justify-between border-b border-line px-4">
              <div className="flex items-center gap-2">
                <FrancaMark size={34} />
                <span className="text-[14px] font-semibold">Menu</span>
              </div>
              <button
                type="button"
                onClick={close}
                className="touch-target rounded-[10px] text-ink-3 hover:bg-surface-2"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3">
              <NavLinks onNavigate={close} />
            </nav>
            <AdminUserPanel />
          </aside>
        </div>
      )}

      {nav.length > 0 && (
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur lg:hidden"
          aria-label="Navegação administrativa"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <ul className="mx-auto flex max-w-lg">
            {nav.map(({ href, short, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <li key={href} className="flex-1">
                  <Link
                    href={href}
                    className={cn(
                      'touch-target flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold',
                      active ? 'text-brand' : 'text-ink-3',
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {short}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </>
  );
}

export function AdminTopbar({ title, actions }: { title: string; actions?: React.ReactNode }) {
  const { toggle } = useAdminMenu();

  return (
    <header className="flex min-h-[60px] flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          className="touch-target inline-flex items-center justify-center rounded-[10px] border border-line text-ink-3 hover:border-brand hover:text-brand lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <LayoutDashboard className="hidden h-4 w-4 text-ink-4 sm:block" aria-hidden="true" />
        <h1 className="text-page-title truncate">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function KpiCard({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: number;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[14px] border border-line bg-surface p-5 shadow-sm">
      <p className="text-section mb-2">{label}</p>
      <p className={cn('text-[28px] font-semibold text-ink', mono && 'font-mono')}>{value}</p>
    </div>
  );
}
