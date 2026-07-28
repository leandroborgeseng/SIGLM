'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Shield } from 'lucide-react';
import { cn } from '@/lib/format';

const ITEMS = [
  { href: '/legislacao', label: 'Início', icon: Home, match: (p: string) => p === '/legislacao' },
  { href: '/legislacao#busca', label: 'Buscar', icon: Search, match: (p: string) => p.startsWith('/legislacao') },
  { href: '/admin/login', label: 'Admin', icon: Shield, match: (p: string) => p.startsWith('/admin') },
];

export function PublicBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="no-print fixed bottom-0 left-0 right-0 z-40 w-full max-w-[100vw] overflow-hidden border-t border-line bg-surface/95 backdrop-blur lg:hidden"
      aria-label="Navegação principal"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="mx-auto flex w-full max-w-lg">
        {ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href} className="min-w-0 flex-1">
              <Link
                href={href}
                className={cn(
                  'touch-target flex w-full flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold transition-colors',
                  active ? 'text-brand' : 'text-ink-3',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
